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

    core.info(`Found ${data.requirements.length} requirements across ${data.books.size} books.`);

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

    core.info(`Generating AsciiDoc files in ${outputDir}...`);
    const generator = new AdocGenerator(outputDir, templatesPath);
    // Generate books based on structure (returns Map<BookTitle, FileName>)
    const generatedFilesMap = await generator.generate(data, structure);

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
    // Prefer Structure Order
    const masterAdocPath = path.join(outputDir, 'full-specs.adoc');
    let masterContent = '= Project Specifications\n:toc: left\n:toclevels: 2\n\n';

    // List of books to include in the order they will appear
    const finalBookSequence: { type: string, file: string, title: string }[] = [];

    // Iterate structure to define order
    for (const bookNode of structure.books) {
      const fileName = generatedFilesMap.get(bookNode.title);
      if (fileName) {
        finalBookSequence.push({ type: bookNode.title, file: fileName, title: bookNode.title });
      }
    }

    // Append Changelog
    try {
      core.info('Generating Changelog...');
      const changelogEntries = await getChangelog();
      if (changelogEntries.length > 0) {
        const changelogContent = generateChangelogAdoc(changelogEntries);
        const changelogFile = 'changelog.adoc';
        await fs.promises.writeFile(path.join(outputDir, changelogFile), changelogContent);
        finalBookSequence.push({ type: 'Changelog', file: changelogFile, title: 'Changelog' });
        core.info(`Added Changelog with ${changelogEntries.length} entries.`);
      } else {
        core.info('No tags found for Changelog.');
      }
    } catch (err) {
      core.warning(`Failed to generate changelog: ${err}`);
    }


    core.info(`Ordered books for generation: ${finalBookSequence.map(b => b.title).join(', ')}`);

    for (const book of finalBookSequence) {
      // For PDF, we include them
      // We typically need to adjust level offset so they become chapters of the master doc
      masterContent += `include::${book.file}[leveloffset=+1]\n\n`;
    }

    // Write master adoc
    await fs.promises.writeFile(masterAdocPath, masterContent);

    core.info(`Compiling Master PDF: ${masterAdocPath}...`);
    await exec.exec(`asciidoctor-pdf -r asciidoctor-diagram -a allow-uri-read ${masterAdocPath}`);

    core.endGroup();
    core.info('Done!');

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
