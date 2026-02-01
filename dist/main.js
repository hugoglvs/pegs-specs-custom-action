"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const io = __importStar(require("@actions/io"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const parser_1 = require("./parser");
const generator_1 = require("./generator");
const validator_1 = require("./validator");
const structure_1 = require("./structure");
const changelog_1 = require("./changelog");
async function run() {
    try {
        const requirementsPath = core.getInput('requirements-path') || 'requirements.csv';
        const outputDir = core.getInput('output-dir') || 'dist';
        const templatesPath = core.getInput('templates-path');
        const structurePath = core.getInput('structure-path') || 'structure.csv';
        core.info(`Loading structure from ${structurePath}`);
        const structure = (0, structure_1.loadStructure)(structurePath);
        core.info(`Reading requirements from ${requirementsPath}`);
        const data = await (0, parser_1.parseRequirements)(requirementsPath, structure);
        core.info(`Found ${data.requirements.length} requirements across ${data.parts.size} parts.`);
        // Validate Requirements
        core.info('Validating requirements ID and structure...');
        const validator = new validator_1.RequirementValidator();
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
        const generator = new generator_1.AdocGenerator(outputDir, templatesPath);
        // Generate full content parts string
        const partsContent = await generator.generate(data, structure);
        // Install dependencies
        core.startGroup('Installing Asciidoctor dependencies');
        // Install dependencies
        core.startGroup('Installing Asciidoctor dependencies');
        // Check for existing installation to avoid permissions issues locally
        let isInstalled = false;
        try {
            await exec.exec('asciidoctor-pdf -v', [], { silent: true });
            isInstalled = true;
            core.info('Asciidoctor tools already installed via gem.');
        }
        catch {
            core.info('Asciidoctor tools not found.');
        }
        if (!isInstalled) {
            // Check platform to decide on sudo usage for basic setup (CI usually runs as runner user)
            // On GitHub Actions runners (ubuntu-latest), sudo is passwordless.
            const isLinux = process.platform === 'linux';
            // On macOS locally, user might need sudo or have valid rbenv. 
            // We defaults to no-sudo for mac unless CI, but here we just keep existing logic (no sudo on mac)
            // If it fails EPERM, user should install manually.
            const sudoPrefix = isLinux ? 'sudo ' : '';
            try {
                await exec.exec(`${sudoPrefix}gem install asciidoctor asciidoctor-pdf asciidoctor-diagram asciidoctor-diagram-plantuml`);
            }
            catch (err) {
                core.warning(`Gem install failed: ${err.message}. Assuming tools might be managed externally or proceed at own risk.`);
            }
        }
        // Ensure graphviz and java (JRE) are installed for plantuml
        try {
            await exec.exec('dot -V', [], { silent: true });
            await exec.exec('java -version', [], { silent: true });
        }
        catch (checkErr) {
            core.info('Graphviz or Java not found. Attempting install...');
            try {
                if (process.platform === 'linux') {
                    await exec.exec('sudo apt-get update');
                    await exec.exec('sudo apt-get install -y graphviz plantuml default-jre');
                }
                else if (process.platform === 'darwin') {
                    await exec.exec('brew install graphviz plantuml openjdk');
                }
            }
            catch (installErr) {
                core.warning(`Dependency install failed: ${installErr.message}. Visualization generation (PlantUML) might fail.`);
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
        // Generate Changelog First
        let changelogContent = '';
        try {
            core.info('Generating Changelog...');
            const changelogEntries = await (0, changelog_1.getChangelog)();
            if (changelogEntries.length > 0) {
                changelogContent = (0, changelog_1.generateChangelogAdoc)(changelogEntries);
                core.info(`Generated Changelog with ${changelogEntries.length} entries.`);
            }
            else {
                core.info('No tags found for Changelog.');
            }
        }
        catch (err) {
            core.warning(`Failed to generate changelog: ${err}`);
        }
        // Generate Master PDF Header
        let masterContent = `= ${projectName}\n`;
        if (authors)
            masterContent += `${authors}\n`;
        masterContent += `${generationDate}\n`;
        masterContent += ':title-page:\n';
        masterContent += ':toc: macro\n:toclevels: 2\n';
        if (logoPath) {
            const absoluteLogoPath = path.isAbsolute(logoPath) ? logoPath : path.resolve(process.cwd(), logoPath);
            if (fs.existsSync(absoluteLogoPath)) {
                masterContent += `:title-logo-image: image:${absoluteLogoPath}[pdfwidth=50%,align=center]\n`;
            }
        }
        masterContent += '\n\n<<<\n\n';
        if (changelogContent) {
            masterContent += changelogContent;
            masterContent += '\n\n<<<\n\n';
        }
        masterContent += 'toc::[]\n\n<<<\n\n';
        // Index requirements by Section title for individual book generation
        const reqsBySectionKey = new Map();
        for (const req of data.requirements) {
            const key = req.section.toLowerCase().trim();
            if (!reqsBySectionKey.has(key))
                reqsBySectionKey.set(key, []);
            reqsBySectionKey.get(key)?.push(req);
        }
        const pdfThemePath = core.getInput('pdf-theme-path');
        const pdfFontsDir = core.getInput('pdf-fonts-dir');
        let themeArgs = '';
        if (pdfThemePath) {
            const absoluteThemePath = path.isAbsolute(pdfThemePath) ? pdfThemePath : path.resolve(process.cwd(), pdfThemePath);
            if (fs.existsSync(absoluteThemePath))
                themeArgs += ` -a pdf-theme=${absoluteThemePath}`;
        }
        if (pdfFontsDir)
            themeArgs += ` -a pdf-fontsdir=${pdfFontsDir}`;
        // Generate individual books
        for (const part of structure.parts) {
            const partFilename = part.title.toLowerCase().replace(/\s+/g, '-');
            const partAdocPath = path.join(outputDir, `${partFilename}.adoc`);
            let partContent = `= ${part.title}\n`;
            if (authors)
                partContent += `${authors}\n`;
            partContent += `${projectName}\n${generationDate}\n`;
            partContent += ':title-page:\n:toc:\n\n';
            const content = await generator.generate({ requirements: data.requirements, parts: data.parts }, { parts: [part], partMap: structure.partMap });
            partContent += content;
            await fs.promises.writeFile(partAdocPath, partContent);
            core.info(`Compiling individual book: ${part.title}...`);
            await exec.exec(`asciidoctor-pdf -r asciidoctor-diagram -a allow-uri-read${themeArgs} ${partAdocPath}`);
        }
        // Append Master Content and compile
        masterContent += partsContent;
        const masterAdocPath = path.join(outputDir, 'full-specs.adoc');
        await fs.promises.writeFile(masterAdocPath, masterContent);
        core.info(`Compiling Master PDF: ${masterAdocPath}...`);
        await exec.exec(`asciidoctor-pdf -r asciidoctor-diagram -a allow-uri-read${themeArgs} ${masterAdocPath}`);
        core.endGroup();
        core.info('Done!');
    }
    catch (error) {
        if (error instanceof Error)
            core.setFailed(error.message);
    }
}
run();
