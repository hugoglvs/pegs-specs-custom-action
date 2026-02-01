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
    async generate(data, structure) {
        // Ensure output dir exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });
        const generatedFiles = new Map();
        // Index requirements by Part then Section for easy lookup
        // We'll map structure title -> req.part? 
        // Better: We iterate the STRUCTURE. For each part in structure, we find matching reqs.
        // Group reqs by Part Name (normalized)
        const reqsByPartKey = new Map();
        for (const req of data.requirements) {
            const key = req.part.toLowerCase().trim();
            if (!reqsByPartKey.has(key))
                reqsByPartKey.set(key, []);
            reqsByPartKey.get(key)?.push(req);
        }
        for (const partNode of structure.parts) {
            const fileName = await this.generatePartFromStructure(partNode, reqsByPartKey);
            generatedFiles.set(partNode.title, fileName);
        }
        return generatedFiles;
    }
    async generatePartFromStructure(partNode, reqsByPartKey) {
        let content = `= ${partNode.title}\n:toc:\n\n`;
        // Get requirements for this part
        const partReqs = reqsByPartKey.get(partNode.title.toLowerCase().trim()) || [];
        // Group by Section
        const reqsBySectionKey = new Map();
        for (const req of partReqs) {
            const cKey = req.section.toLowerCase().trim();
            if (!reqsBySectionKey.has(cKey))
                reqsBySectionKey.set(cKey, []);
            reqsBySectionKey.get(cKey)?.push(req);
        }
        for (const sectionNode of partNode.children) {
            content += `== ${sectionNode.id} ${sectionNode.title}\n`;
            const sectionReqs = reqsBySectionKey.get(sectionNode.title.toLowerCase().trim());
            if (sectionReqs && sectionReqs.length > 0) {
                content += this.generateSectionContent(sectionReqs) + '\n';
            }
            else {
                content += `_No requirements for this section._\n\n`;
            }
        }
        // Clean filename: "Goals Book" -> "goals.adoc"
        // Try to keep consistent with old naming if possible, default to sanitized title
        let baseName = partNode.title.toLowerCase().split(' ')[0]; // "goals"
        if (baseName.length < 3)
            baseName = partNode.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${baseName}.adoc`;
        await fs.promises.writeFile(path.join(this.outputDir, fileName), content);
        return fileName;
    }
    generateSectionContent(reqs) {
        // Build hierarchy first
        const roots = this.buildHierarchy(reqs);
        return this.renderRequirements(roots, 3); // Start at level 3 (===)
    }
    buildHierarchy(reqs) {
        const reqMap = new Map();
        const roots = [];
        // First pass: map all requirements
        reqs.forEach(req => {
            req.children = []; // Initialize children
            reqMap.set(req.id, req);
        });
        // Second pass: link parents and children
        reqs.forEach(req => {
            if (req.parent && reqMap.has(req.parent)) {
                // It has a parent in this list
                const parent = reqMap.get(req.parent);
                parent?.children?.push(req);
            }
            else {
                // It's a root (no parent, or parent not in this section context)
                roots.push(req);
            }
        });
        return roots;
    }
    renderRequirements(reqs, level) {
        let content = '';
        const headerPrefix = '='.repeat(level);
        for (const req of reqs) {
            content += `${headerPrefix} ${req.id}\n`;
            if (req.priority) {
                content += `*Priority*: ${req.priority}\n\n`;
            }
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
            // Only add separator if it's a top-level requirement relative to the section
            if (level === 3) {
                content += `---\n\n`;
            }
            else {
                content += `\n`;
            }
            // Render children recursively
            if (req.children && req.children.length > 0) {
                content += this.renderRequirements(req.children, level + 1);
            }
        }
        return content;
    }
    handleAttachedFiles(attachedFiles, reqId) {
        let content = '';
        const items = attachedFiles.split(';').map(s => s.trim());
        for (const item of items) {
            if (!item)
                continue;
            const [filePath, customCaption] = item.split('|').map(s => s.trim());
            const caption = customCaption ? `.${customCaption}` : `.Visual for ${reqId}`;
            if (filePath.match(/\.puml$/i)) {
                content += `\n${caption}\nplantuml::${filePath}[format=svg, target=diagram-${reqId}-${Math.random().toString(36).substring(7)}, align=center]\n\n`;
            }
            else if (filePath.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
                content += `\n${caption}\nimage::${filePath}[${reqId} Image, align=center]\n\n`;
            }
            else {
                content += `\nlink:${filePath}[Attached File]\n\n`;
            }
        }
        return content;
    }
}
exports.AdocGenerator = AdocGenerator;
