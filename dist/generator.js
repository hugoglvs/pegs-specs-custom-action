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
    constructor(outputDir) {
        this.outputDir = outputDir;
    }
    async generate(data) {
        // Ensure output dir exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });
        // Group by Book
        const books = this.groupByBook(data.requirements);
        for (const [bookName, requirements] of books.entries()) {
            await this.generateBook(bookName, requirements);
        }
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
        let content = `= ${bookName}\n:toc:\n\n`;
        for (const [chapterName, reqs] of chapters.entries()) {
            content += `== ${chapterName}\n\n`;
            for (const req of reqs) {
                content += `=== ${req.id}\n`;
                content += `*Description*: ${req.description}\n\n`;
                if (req.referenceTo) {
                    // Assuming referenceTo contains comma separated IDs
                    const refs = req.referenceTo.split(',').map(r => r.trim());
                    const links = refs.map(r => `<<${r}>>`).join(', ');
                    content += `*References*: ${links}\n\n`;
                }
                if (req.attachedFiles) {
                    content += this.handleAttachedFiles(req.attachedFiles, req.id);
                }
                // Add an anchor for cross-referencing
                content += `[#${req.id}]\n`;
                content += `---\n\n`;
            }
        }
        const cleanName = bookName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await fs.promises.writeFile(path.join(this.outputDir, `${cleanName}.adoc`), content);
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
        const items = attachedFiles.split(';').map(s => s.trim()); // Support multiple with semicolon
        for (const item of items) {
            if (!item)
                continue;
            // Check for PlantUML file extension
            if (item.match(/\.puml$/i)) {
                // Use the plantuml macro for external files. 
                // Note: The path must be relative to the adoc file or absolute, 
                // but typically in Asciidoctor standard practice, relative to the document is best.
                // We act as if 'item' is the correct relative path (e.g., "Assets/diagram.puml").
                // We include an ID in the target filename to avoid caching collisions if needed, 
                // though strictly 'target' in the macro is usually the output image name.
                // Format: plantuml::input-file[format=svg, target=output-filename]
                content += `\nplantuml::${item}[format=svg, target=diagram-${reqId}]\n\n`;
            }
            // Check for Image file extensions
            else if (item.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
                content += `\nimage::${item}[${reqId} Image]\n\n`;
            }
            // Fallback: If it's a URI but not an image/puml, just link it
            else {
                content += `\nlink:${item}[Attached File]\n\n`;
            }
        }
        return content;
    }
}
exports.AdocGenerator = AdocGenerator;
