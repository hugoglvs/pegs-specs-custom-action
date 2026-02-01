import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as path from 'path';
import * as fs from 'fs';
import { parseRequirements } from './parser';
import { AdocGenerator } from './generator';
import { RequirementValidator } from './validator';
import { loadStructure } from './structure';
import { getChangelog, generateChangelogAdoc } from './changelog';

async function run(): Promise<void> {
  try {
    const requirementsPath = core.getInput('requirements-path');
    const outputDir = core.getInput('output-dir');
    const templatesPath = core.getInput('templates-path');
    const structurePath = core.getInput('structure-path') || 'structure.csv';

    core.info(`Loading structure from ${structurePath}`);
    const structure = loadStructure(structurePath);

    core.info(`Reading requirements from ${requirementsPath}`);
    const data = await parseRequirements(requirementsPath, structure);

    core.info(`Found ${data.requirements.length} requirements across ${data.parts.size} parts.`);

    // Validate Requirements
    core.info('Validating requirements ID and structure...');
    const validator = new RequirementValidator();
    const validationResult = await validator.validate(data.requirements, structure);

    if (validationResult.warnings.length > 0) {
      validationResult.warnings.forEach(w => core.warning(w));
    }

    if (!validationResult.isValid) {
      validationResult.errors.forEach(e => core.error(e));
      core.setFailed('Validation failed. Please correct the errors above.');
      return;
    }
    core.info('Validation passed.');

    core.info(`Generating AsciiDoc content...`);
    const generator = new AdocGenerator(outputDir, templatesPath);
    // Generate full content parts string
    const partsContent = await generator.generate(data, structure);

    // Install dependencies
    core.startGroup('Installing Asciidoctor dependencies');


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

    const projectName = core.getInput('project-name') || process.env.GITHUB_REPOSITORY?.split('/')[1] || 'Project Specifications';
    const authorsInput = core.getInput('authors') || process.env.GITHUB_REPOSITORY_OWNER || '';
    const authors = authorsInput.split(',').map(a => a.trim()).join('; ');
    const logoPath = core.getInput('logo-path');
    const generationDate = new Date().toISOString().split('T')[0];

    // Build PDF and HTML
    core.startGroup('Building Artifacts');

    // 1. Generate Master PDF
    // Prefer Structure Order
    const masterAdocPath = path.join(outputDir, 'full-specs.adoc');

    // Generate Changelog First
    let changelogContent = '';
    try {
      core.info('Generating Changelog...');
      const changelogEntries = await getChangelog();
      if (changelogEntries.length > 0) {
        changelogContent = generateChangelogAdoc(changelogEntries);
        core.info(`Generated Changelog with ${changelogEntries.length} entries.`);
      } else {
        core.info('No tags found for Changelog.');
      }
    } catch (err) {
      core.warning(`Failed to generate changelog: ${err}`);
    }

    let masterContent = `= ${projectName}\n`;
    if (authors) masterContent += `${authors}\n`;
    masterContent += `${generationDate}\n`;
    masterContent += ':title-page:\n';
    masterContent += ':toc: macro\n:toclevels: 2\n'; // Use macro to control placement

    if (logoPath) {
      // Use absolute path for logo to ensure asciidoctor-pdf can find it regardless of CWD
      const absoluteLogoPath = path.isAbsolute(logoPath) ? logoPath : path.resolve(process.cwd(), logoPath);
      if (fs.existsSync(absoluteLogoPath)) {
        masterContent += `:title-logo-image: image:${absoluteLogoPath}[pdfwidth=50%,align=center]\n`;
      } else {
        core.warning(`Logo not found at ${absoluteLogoPath}`);
      }
    }
    masterContent += '\n\n<<<\n\n';

    // Insert Changelog before TOC
    if (changelogContent) {
      masterContent += changelogContent;
      masterContent += '\n\n<<<\n\n';
    }

    // Insert TOC
    masterContent += 'toc::[]\n\n<<<\n\n';

    // Append Parts Content
    masterContent += partsContent;

    // Write master adoc
    await fs.promises.writeFile(masterAdocPath, masterContent);

    const pdfThemePath = core.getInput('pdf-theme-path');
    const pdfFontsDir = core.getInput('pdf-fonts-dir');

    let pdfCommand = `asciidoctor-pdf -r asciidoctor-diagram -a allow-uri-read`;
    if (pdfThemePath) {
      pdfCommand += ` -a pdf-theme=${pdfThemePath}`;
    }
    if (pdfFontsDir) {
      pdfCommand += ` -a pdf-fontsdir=${pdfFontsDir}`;
    }
    pdfCommand += ` ${masterAdocPath}`;

    core.info(`Compiling Master PDF: ${masterAdocPath}...`);
    await exec.exec(pdfCommand);

    core.endGroup();
    core.info('Done!');

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
