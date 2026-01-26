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
exports.AdocGenerator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class AdocGenerator {
    constructor(outputDir, templatesPath) {
        this.outputDir = outputDir;
        this.templatesPath = templatesPath;
    }
    async generate(data) {
        // Ensure output dir exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });
        const generatedFiles = new Map();
        // Group by Book
        const books = this.groupByBook(data.requirements);
        for (const [bookName, requirements] of books.entries()) {
            const fileName = await this.generateBook(bookName, requirements);
            if (fileName) {
                generatedFiles.set(bookName, fileName);
            }
        }
        return generatedFiles;
    }
    groupByBook(requirements) {
        const map = new Map();
        for (const req of requirements) {
            if (!map.has(req.book)) {
                map.set(req.book, []);
            }
            map.get(req.book)?.push(req);
        }
        return map;
    }
    async generateBook(bookName, requirements) {
        const chapters = this.groupByChapter(requirements);
        // Derive template filename from book name (e.g., "Goals Book" -> "goals.adoc")
        const templateName = bookName.toLowerCase().split(' ')[0] + '.adoc';
        const templatePath = path.join(this.templatesPath, templateName);
        let content = '';
        let hasRequirementsInjected = false;
        if (fs.existsSync(templatePath)) {
            console.log(`Using template: ${templatePath}`);
            const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
            const result = this.injectRequirements(templateContent, chapters);
            content = result.content;
            hasRequirementsInjected = result.injected;
        }
        else {
            console.warn(`Template not found: ${templatePath}. Falling back to default generation.`);
            content = `= ${bookName}\n:toc:\n\n`;
            for (const [chapterName, reqs] of chapters.entries()) {
                content += `== ${chapterName}\n\n`;
                content += this.generateChapterContent(reqs);
            }
            hasRequirementsInjected = requirements.length > 0;
        }
        if (!hasRequirementsInjected) {
            console.log(`Skipping book generation for '${bookName}' as it has no valid chapters with requirements.`);
            return null;
        }
        const cleanName = bookName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${cleanName}.adoc`;
        await fs.promises.writeFile(path.join(this.outputDir, fileName), content);
        return fileName;
    }
    injectRequirements(templateContent, chapters) {
        // Pre-calculate normalized chapter keys for better matching
        const normalizedChapters = new Map();
        for (const [title, reqs] of chapters.entries()) {
            normalizedChapters.set(title.toLowerCase().trim(), reqs);
        }
        // Split by level 2 headers, but keep the headers in the result
        // The lookahead regex (?=== ) ensures we split BEFORE each header
        const sections = templateContent.split(/(?=== )/);
        let newContent = '';
        let injected = false;
        for (const section of sections) {
            // First section is usually the book title and intro, we keep it
            if (!section.startsWith('== ')) {
                newContent += section;
                continue;
            }
            // Extract the header title from the first line of this section
            const lines = section.split('\n');
            const headerLine = lines[0];
            const match = headerLine.match(/^==\s+(.+)$/);
            if (match) {
                const chapterTitle = match[1].trim();
                const normalizedTitle = chapterTitle.toLowerCase().trim();
                if (normalizedChapters.has(normalizedTitle)) {
                    const reqs = normalizedChapters.get(normalizedTitle);
                    if (reqs && reqs.length > 0) {
                        console.log(`Injecting ${reqs.length} requirements into chapter: ${chapterTitle}`);
                        // Add the whole section (includes header and its own text)
                        newContent += section;
                        // Ensure a clean separation before adding requirements if not already there
                        if (!newContent.endsWith('\n'))
                            newContent += '\n';
                        newContent += '\n' + this.generateChapterContent(reqs) + '\n';
                        injected = true;
                    }
                }
                else {
                    console.log(`Skipping empty template chapter: ${chapterTitle}`);
                }
            }
            else {
                // Should not happen with current regex, but safety first
                newContent += section;
            }
        }
        return { content: newContent, injected };
    }
    generateChapterContent(reqs) {
        let content = '';
        for (const req of reqs) {
            content += `=== ${req.id}\n`;
            content += `*Description*: ${req.description}\n\n`;
            if (req.referenceTo) {
                const refs = req.referenceTo.split(',').map(r => r.trim());
                const links = refs.map(r => `<<${r}>>`).join(', ');
                content += `*References*: ${links}\n\n`;
            }
            if (req.attachedFiles) {
                content += this.handleAttachedFiles(req.attachedFiles, req.id);
            }
            content += `[#${req.id}]\n`;
            content += `---\n\n`;
        }
        return content;
    }
    groupByChapter(requirements) {
        const map = new Map();
        for (const req of requirements) {
            if (!map.has(req.chapter)) {
                map.set(req.chapter, []);
            }
            map.get(req.chapter)?.push(req);
        }
        return map;
    }
    handleAttachedFiles(attachedFiles, reqId) {
        let content = '';
        const items = attachedFiles.split(';').map(s => s.trim());
        for (const item of items) {
            if (!item)
                continue;
            if (item.match(/\.puml$/i)) {
                content += `\nplantuml::${item}[format=svg, target=diagram-${reqId}]\n\n`;
            }
            else if (item.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
                content += `\nimage::${item}[${reqId} Image]\n\n`;
            }
            else {
                content += `\nlink:${item}[Attached File]\n\n`;
            }
        }
        return content;
    }
}
exports.AdocGenerator = AdocGenerator;
