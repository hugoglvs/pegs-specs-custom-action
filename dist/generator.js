"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdocGenerator = void 0;
class AdocGenerator {
    constructor(outputDir, templatesPath) {
        this.outputDir = outputDir;
        this.templatesPath = templatesPath;
    }
    async generate(data, structure) {
        let fullContent = '';
        // Index requirements by Section title for easy lookup
        const reqsBySectionKey = new Map();
        for (const req of data.requirements) {
            const key = req.section.toLowerCase().trim();
            if (!reqsBySectionKey.has(key))
                reqsBySectionKey.set(key, []);
            reqsBySectionKey.get(key)?.push(req);
        }
        for (const partNode of structure.parts) {
            const partContent = await this.generatePartContent(partNode, reqsBySectionKey);
            fullContent += partContent;
            fullContent += '\n\n<<<\n\n';
        }
        return fullContent;
    }
    async generatePartContent(partNode, reqsBySectionKey) {
        let content = `== ${partNode.title}\n\n`;
        for (const childNode of partNode.children) {
            content += this.renderSectionRecursive(childNode, reqsBySectionKey, 3);
        }
        return content;
    }
    renderSectionRecursive(node, reqsBySectionKey, level) {
        const headerPrefix = '='.repeat(level);
        let content = `${headerPrefix} ${node.id} ${node.title}\n\n`;
        const sectionReqs = reqsBySectionKey.get(node.title.toLowerCase().trim());
        if (sectionReqs && sectionReqs.length > 0) {
            content += this.generateSectionContent(sectionReqs) + '\n';
        }
        // Render sub-sections
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                content += this.renderSectionRecursive(child, reqsBySectionKey, level + 1);
            }
        }
        else if (!sectionReqs || sectionReqs.length === 0) {
            content += `_No requirements for this section._\n\n`;
        }
        return content;
    }
    generateSectionContent(reqs) {
        const roots = this.buildHierarchy(reqs);
        return this.renderRequirements(roots, 4);
    }
    buildHierarchy(reqs) {
        const reqMap = new Map();
        const roots = [];
        reqs.forEach(req => {
            req.children = [];
            reqMap.set(req.id, req);
        });
        reqs.forEach(req => {
            if (req.parent && reqMap.has(req.parent)) {
                const parent = reqMap.get(req.parent);
                parent?.children?.push(req);
            }
            else {
                roots.push(req);
            }
        });
        return roots;
    }
    renderRequirements(reqs, level) {
        let content = '';
        const headerPrefix = '='.repeat(level);
        for (const req of reqs) {
            let reqLine = `[.req_id]#${req.id}# `;
            if (req.priority) {
                reqLine += `[.priority]#${req.priority}# `;
            }
            reqLine += `${req.description}\n\n`;
            content += reqLine;
            if (req.attachedFiles) {
                content += this.handleAttachedFiles(req.attachedFiles, req.id);
            }
            if (req.referenceTo) {
                content += `[cols="1,4", options="noheader", frame="none", grid="none"]\n|===\n`;
                const refs = req.referenceTo.split(',').map(r => r.trim());
                const links = refs.map(r => `<<${r}>>`).join(', ');
                content += `|*References*: | ${links}\n`;
                content += `|===\n\n`;
            }
            content += `[#${req.id}]\n`;
            if (level === 4) {
                content += `---\n\n`;
            }
            else {
                content += `\n`;
            }
            if (req.children && req.children.length > 0) {
                content += `\n--\n`;
                content += this.renderRequirements(req.children, level + 1);
                content += `\n\n`;
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
                content += `\n[.text-center]\n${caption}\nplantuml::${filePath}[format=svg, target=diagram-${reqId}-${Math.random().toString(36).substring(7)}, align=center]\n\n`;
            }
            else if (filePath.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
                content += `\n[.text-center]\n${caption}\nimage::${filePath}[${reqId} Image, align=center]\n\n`;
            }
            else {
                content += `\nlink:${filePath}[Attached File]\n\n`;
            }
        }
        return content;
    }
}
exports.AdocGenerator = AdocGenerator;
