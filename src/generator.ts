import { Requirement, ParsedRequirements } from './types';
import { Structure, StructureNode } from './structure';
import * as fs from 'fs';
import * as path from 'path';

export class AdocGenerator {
    private outputDir: string;
    // templatesPath is now only used for assets or overrides if needed, but primary structure is dynamic
    // We keep it for potentially falling back to manual templates if structure is missing? 
    // Plan says "Remove static .adoc book templates", so we rely fully on structure.
    private templatesPath: string;

    constructor(outputDir: string, templatesPath: string) {
        this.outputDir = outputDir;
        this.templatesPath = templatesPath;
    }

    public async generate(data: ParsedRequirements, structure: Structure): Promise<Map<string, string>> {
        // Ensure output dir exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });

        const generatedFiles = new Map<string, string>();

        // Index requirements by Part then Section for easy lookup
        // We'll map structure title -> req.part? 
        // Better: We iterate the STRUCTURE. For each part in structure, we find matching reqs.

        // Group reqs by Part Name (normalized)
        const reqsByPartKey = new Map<string, Requirement[]>();
        for (const req of data.requirements) {
            const key = req.part.toLowerCase().trim();
            if (!reqsByPartKey.has(key)) reqsByPartKey.set(key, []);
            reqsByPartKey.get(key)?.push(req);
        }

        for (const partNode of structure.parts) {
            const fileName = await this.generatePartFromStructure(partNode, reqsByPartKey);
            generatedFiles.set(partNode.title, fileName);
        }

        return generatedFiles;
    }

    private async generatePartFromStructure(partNode: StructureNode, reqsByPartKey: Map<string, Requirement[]>): Promise<string> {
        let content = `= ${partNode.title}\n:toc:\n\n`;


        // Get requirements for this part
        const partReqs = reqsByPartKey.get(partNode.title.toLowerCase().trim()) || [];

        // Group by Section
        const reqsBySectionKey = new Map<string, Requirement[]>();
        for (const req of partReqs) {
            const cKey = req.section.toLowerCase().trim();
            if (!reqsBySectionKey.has(cKey)) reqsBySectionKey.set(cKey, []);
            reqsBySectionKey.get(cKey)?.push(req);
        }

        for (const sectionNode of partNode.children) {
            content += `== ${sectionNode.id} ${sectionNode.title}\n`;


            const sectionReqs = reqsBySectionKey.get(sectionNode.title.toLowerCase().trim());

            if (sectionReqs && sectionReqs.length > 0) {
                content += this.generateSectionContent(sectionReqs) + '\n';
            } else {
                content += `_No requirements for this section._\n\n`;
            }
        }

        // Clean filename: "Goals Book" -> "goals.adoc"
        // Try to keep consistent with old naming if possible, default to sanitized title
        let baseName = partNode.title.toLowerCase().split(' ')[0]; // "goals"
        if (baseName.length < 3) baseName = partNode.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const fileName = `${baseName}.adoc`;
        await fs.promises.writeFile(path.join(this.outputDir, fileName), content);
        return fileName;
    }


    private generateSectionContent(reqs: Requirement[]): string {
        // Build hierarchy first
        const roots = this.buildHierarchy(reqs);
        return this.renderRequirements(roots, 3); // Start at level 3 (===)
    }

    private buildHierarchy(reqs: Requirement[]): Requirement[] {
        const reqMap = new Map<string, Requirement>();
        const roots: Requirement[] = [];

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
            } else {
                // It's a root (no parent, or parent not in this section context)
                roots.push(req);
            }
        });

        return roots;
    }

    private renderRequirements(reqs: Requirement[], level: number): string {
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
            } else {
                content += `\n`;
            }

            // Render children recursively
            if (req.children && req.children.length > 0) {
                content += this.renderRequirements(req.children, level + 1);
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
