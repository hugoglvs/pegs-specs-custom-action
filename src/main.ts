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

        core.info(`Reading requirements from ${requirementsPath}`);
        const data = await parseRequirements(requirementsPath);

        core.info(`Found ${data.requirements.length} requirements across ${data.books.size} books.`);

        core.info(`Generating AsciiDoc files in ${outputDir}...`);
        const generator = new AdocGenerator(outputDir);
        await generator.generate(data);

        // Install dependencies
        core.startGroup('Installing Asciidoctor dependencies');

        // Check platform to decide on sudo usage for basic setup (CI usually runs as runner user)
        // On GitHub Actions runners (ubuntu-latest), sudo is passwordless.
        const isLinux = process.platform === 'linux';
        const sudoPrefix = isLinux ? 'sudo ' : '';

        await exec.exec(`${sudoPrefix}gem install asciidoctor asciidoctor-pdf asciidoctor-diagram`);
        // Ensure graphviz is installed for plantuml (often 'dot' command is needed)
        // On GitHub runners, graphviz is usually pre-installed. We might want to try-install it.
        try {
            await exec.exec('dot -V');
        } catch {
            core.info('Graphviz not found. Attempting install...');
            if (process.platform === 'linux') {
                await exec.exec('sudo apt-get update');
                await exec.exec('sudo apt-get install -y graphviz');
            } else if (process.platform === 'darwin') {
                await exec.exec('brew install graphviz');
            }
        }
        core.endGroup();

        // Copy Assets directory if it exists, so relative paths in adoc work
        const assetsSource = 'Assets'; // Convention: Assets folder at root
        const assetsDest = path.join(outputDir, 'Assets');
        if (fs.existsSync(assetsSource)) {
            core.info(`Copying ${assetsSource} to ${assetsDest}...`);
            await io.cp(assetsSource, assetsDest, { recursive: true, force: true });
        }

        // Build PDF and HTML
        core.startGroup('Building Artifacts');

        const generatedFiles = Array.from(data.books).map(book => {
            const cleanName = book.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            return path.join(outputDir, `${cleanName}.adoc`);
        });

        for (const file of generatedFiles) {
            core.info(`Compiling ${file} to PDF...`);
            // Use -r asciidoctor-diagram to support plantuml
            await exec.exec(`asciidoctor-pdf -r asciidoctor-diagram -a allow-uri-read ${file}`);

            core.info(`Compiling ${file} to HTML...`);
            await exec.exec(`asciidoctor -r asciidoctor-diagram -a allow-uri-read ${file}`);
        }

        core.endGroup();
        core.info('Done!');

    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
