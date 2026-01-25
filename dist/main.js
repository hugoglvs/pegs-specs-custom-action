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
const path = __importStar(require("path"));
const parser_1 = require("./parser");
const generator_1 = require("./generator");
async function run() {
    try {
        const requirementsPath = core.getInput('requirements-path');
        const outputDir = core.getInput('output-dir');
        core.info(`Reading requirements from ${requirementsPath}`);
        const data = await (0, parser_1.parseRequirements)(requirementsPath);
        core.info(`Found ${data.requirements.length} requirements across ${data.books.size} books.`);
        core.info(`Generating AsciiDoc files in ${outputDir}...`);
        const generator = new generator_1.AdocGenerator(outputDir);
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
        }
        catch {
            core.info('Graphviz not found. Attempting install...');
            if (process.platform === 'linux') {
                await exec.exec('sudo apt-get update');
                await exec.exec('sudo apt-get install -y graphviz');
            }
            else if (process.platform === 'darwin') {
                await exec.exec('brew install graphviz');
            }
        }
        core.endGroup();
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
    }
    catch (error) {
        if (error instanceof Error)
            core.setFailed(error.message);
    }
}
run();
