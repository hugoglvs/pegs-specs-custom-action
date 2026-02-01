import { Requirement, ParsedRequirements } from './types';
import { Structure, StructureNode } from './structure';
import * as fs from 'fs';
import * as path from 'path';

export class AdocGenerator {
    private outputDir: string;
    private templatesPath: string;

    constructor(outputDir: string, templatesPath: string) {
        this.outputDir = outputDir;
        this.templatesPath = templatesPath;
    }

    public async generate(data: ParsedRequirements, structure: Structure): Promise<string> {
        let fullContent = '';

        // Index requirements by Section title for easy lookup
        const reqsBySectionKey = new Map<string, Requirement[]>();
        for (const req of data.requirements) {
            const key = req.section.toLowerCase().trim();
            if (!reqsBySectionKey.has(key)) reqsBySectionKey.set(key, []);
            reqsBySectionKey.get(key)?.push(req);
        }

        for (const partNode of structure.parts) {
            const partContent = await this.generatePartContent(partNode, reqsBySectionKey);
            fullContent += partContent;
            fullContent += '\n\n<<<\n\n';
        }

        return fullContent;
    }

    private async generatePartContent(partNode: StructureNode, reqsBySectionKey: Map<string, Requirement[]>): Promise<string> {
        let content = `== ${partNode.title}\n\n`;

        for (const childNode of partNode.children) {
            content += this.renderSectionRecursive(childNode, reqsBySectionKey, 3);
        }

        return content;
    }

    private renderSectionRecursive(node: StructureNode, reqsBySectionKey: Map<string, Requirement[]>, level: number): string {
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
        } else if (!sectionReqs || sectionReqs.length === 0) {
            content += `_No requirements for this section._\n\n`;
        }

        return content;
    }

    private generateSectionContent(reqs: Requirement[]): string {
        const roots = this.buildHierarchy(reqs);
        return this.renderRequirements(roots, 4);
    }

    private buildHierarchy(reqs: Requirement[]): Requirement[] {
        const reqMap = new Map<string, Requirement>();
        const roots: Requirement[] = [];

        reqs.forEach(req => {
            req.children = [];
            reqMap.set(req.id, req);
        });

        reqs.forEach(req => {
            if (req.parent && reqMap.has(req.parent)) {
                const parent = reqMap.get(req.parent);
                parent?.children?.push(req);
            } else {
                roots.push(req);
            }
        });

        return roots;
    }

    private renderRequirements(reqs: Requirement[], level: number): string {
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
            } else {
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

    private handleAttachedFiles(attachedFiles: string, reqId: string): string {
        let content = '';
        const items = attachedFiles.split(';').map(s => s.trim());

        for (const item of items) {
            if (!item) continue;

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
