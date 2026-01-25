import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as path from 'path';
import * as fs from 'fs';
import { parseRequirements } from './parser';
import { AdocGenerator } from './generator';

async function run(): Promise<void> {
  try {
    const requirementsPath = core.getInput('requirements-path');
    const outputDir = core.getInput('output-dir');
    const templatesPath = core.getInput('templates-path');

    core.info(`Reading requirements from ${requirementsPath}`);
    const data = await parseRequirements(requirementsPath);

    core.info(`Found ${data.requirements.length} requirements across ${data.books.size} books.`);

    core.info(`Using templates from ${templatesPath}...`);
    core.info(`Generating AsciiDoc files in ${outputDir}...`);
    const generator = new AdocGenerator(outputDir, templatesPath);
    const generatedFilesMap = await generator.generate(data);

    // Install dependencies
    core.startGroup('Installing Asciidoctor dependencies');

    // Check platform to decide on sudo usage for basic setup (CI usually runs as runner user)
    // On GitHub Actions runners (ubuntu-latest), sudo is passwordless.
    const isLinux = process.platform === 'linux';
    const sudoPrefix = isLinux ? 'sudo ' : '';

    await exec.exec(`${sudoPrefix}gem install asciidoctor asciidoctor-pdf asciidoctor-diagram asciidoctor-diagram-plantuml`);
    // Ensure graphviz and java (JRE) are installed for plantuml
    try {
      await exec.exec('dot -V');
      await exec.exec('java -version');
    } catch {
      core.info('Graphviz or Java not found. Attempting install...');
      if (process.platform === 'linux') {
        await exec.exec('sudo apt-get update');
        await exec.exec('sudo apt-get install -y graphviz plantuml default-jre');
      } else if (process.platform === 'darwin') {
        await exec.exec('brew install graphviz plantuml openjdk');
      }
    }
    core.endGroup();

    // Copy assets directory if it exists, so relative paths in adoc work
    const assetsSource = 'assets'; // Convention: assets folder at root
    const assetsDest = path.join(outputDir, 'assets');
    if (fs.existsSync(assetsSource)) {
      core.info(`Copying ${assetsSource} to ${assetsDest}...`);
      await io.cp(assetsSource, assetsDest, { recursive: true, force: true });
    }

    // Build PDF and HTML
    core.startGroup('Building Artifacts');

    // 1. Generate Master PDF
    // Order: Project -> Environment -> Goals -> System
    // We try to find the files for these books in the generated map
    // Keys in generatedFilesMap are the book names from CSV (e.g. "Goals Book")
    const bookOrder = ['Project', 'Environment', 'Goals', 'System'];
    // Helper to find the file for a book type (matches if book name starts with type)
    const findFile = (type: string) => {
      for (const [bookName, fileName] of generatedFilesMap.entries()) {
        if (bookName.toLowerCase().startsWith(type.toLowerCase())) {
          return fileName;
        }
      }
      return null;
    };

    const masterAdocPath = path.join(outputDir, 'full-specs.adoc');
    let masterContent = '= Project Specifications\n:toc: left\n:toclevels: 2\n\n';

    // Track valid files for HTML generation later
    const validBooks: { type: string, file: string, title: string }[] = [];

    for (const type of bookOrder) {
      const fileName = findFile(type);
      if (fileName) {
        // For PDF, we include them
        // We typically need to adjust level offset so they become chapters of the master doc
        masterContent += `include::${fileName}[leveloffset=+1]\n\n`;
        validBooks.push({ type, file: fileName, title: type });
      }
    }

    // Write master adoc
    await fs.promises.writeFile(masterAdocPath, masterContent);

    core.info(`Compiling Master PDF: ${masterAdocPath}...`);
    await exec.exec(`asciidoctor-pdf -r asciidoctor-diagram -a allow-uri-read ${masterAdocPath}`);

    // 2. Generate Tabbed HTML
    // First, generate partial HTMLs for each book (body only)
    for (const book of validBooks) {
      const filePath = path.join(outputDir, book.file);
      // -s for no header/footer, -o to output specific html file
      const htmlOut = filePath.replace('.adoc', '.html');
      await exec.exec(`asciidoctor -r asciidoctor-diagram -a allow-uri-read -s -o ${htmlOut} ${filePath}`);
    }

    // Read partials and inject into index.html
    let tabsHtml = '<div class="tab">\n';
    let contentHtml = '';

    for (let i = 0; i < validBooks.length; i++) {
      const book = validBooks[i];
      const isActive = i === 0 ? 'active' : '';
      const displayStyle = i === 0 ? 'block' : 'none';

      tabsHtml += `<button class="tablinks ${isActive}" onclick="openBook(event, '${book.type}')">${book.title}</button>\n`;

      const partialPath = path.join(outputDir, book.file.replace('.adoc', '.html'));
      const partialContent = await fs.promises.readFile(partialPath, 'utf-8');

      contentHtml += `<div id="${book.type}" class="tabcontent" style="display:${displayStyle}">
                ${partialContent}
            </div>\n`;
    }
    tabsHtml += '</div>\n';

    const indexHtml = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body {font-family: Arial;}

/* Style the tab */
.tab {
  overflow: hidden;
  border: 1px solid #ccc;
  background-color: #f1f1f1;
}

/* Style the buttons inside the tab */
.tab button {
  background-color: inherit;
  float: left;
  border: none;
  outline: none;
  cursor: pointer;
  padding: 14px 16px;
  transition: 0.3s;
  font-size: 17px;
}

/* Change background color of buttons on hover */
.tab button:hover {
  background-color: #ddd;
}

/* Create an active/current tablink class */
.tab button.active {
  background-color: #ccc;
}

/* Style the tab content */
.tabcontent {
  display: none;
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-top: none;
}
</style>
</head>
<body>

<h2>Project Specifications</h2>

${tabsHtml}

${contentHtml}

<script>
function openBook(evt, bookName) {
  var i, tabcontent, tablinks;
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(bookName).style.display = "block";
  evt.currentTarget.className += " active";
}
</script>
   
</body>
</html> 
`;
    await fs.promises.writeFile(path.join(outputDir, 'index.html'), indexHtml);
    core.info('Generated index.html with tabs.');

    core.endGroup();
    core.info('Done!');

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
