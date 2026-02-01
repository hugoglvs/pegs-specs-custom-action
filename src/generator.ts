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

    public async generate(data: ParsedRequirements, structure: Structure): Promise<string> {
        // Ensure output dir exists (still needed for assets copying later in main, but maybe not strictly for this method if we don't write files)
        // main.ts handles mkdir, but let's keep it safe or rely on main.
        // We actually don't need outputDir in constructor anymore if we don't write files.
        // But we might need it for resolving relative paths if we did anything complex. 
        // For now, let's just generate the string.

        // We will build the body content.
        let fullContent = '';

        // Index requirements by Part then Section for easy lookup
        const reqsByPartKey = new Map<string, Requirement[]>();
        for (const req of data.requirements) {
            const key = req.part.toLowerCase().trim();
            if (!reqsByPartKey.has(key)) reqsByPartKey.set(key, []);
            reqsByPartKey.get(key)?.push(req);
        }

        for (const partNode of structure.parts) {
            const partContent = await this.generatePartContent(partNode, reqsByPartKey);
            fullContent += partContent;
            // Add a page break between parts?
            // The master doc usually puts breaks. We can add specific breaks here.
            fullContent += '\n\n<<<\n\n';
        }

        return fullContent;
    }

    private async generatePartContent(partNode: StructureNode, reqsByPartKey: Map<string, Requirement[]>): Promise<string> {
        // Part Title at Level 1 (==) because Master is Level 0 (=)
        let content = `== ${partNode.title}\n\n`;
        // Description removed as per previous fix

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
            // Section Title at Level 2 (===)
            content += `=== ${sectionNode.id} ${sectionNode.title}\n\n`;
            // Description removed as per previous fix

            const sectionReqs = reqsBySectionKey.get(sectionNode.title.toLowerCase().trim());

            if (sectionReqs && sectionReqs.length > 0) {
                content += this.generateSectionContent(sectionReqs) + '\n';
            } else {
                content += `_No requirements for this section._\n\n`;
            }
        }

        return content;
    }


    private generateSectionContent(reqs: Requirement[]): string {
        // Build hierarchy first
        const roots = this.buildHierarchy(reqs);
        // Start at level 4 (====) for requirements, since Section is level 2 (===) wait.
        // Part: ==
        // Section: ===
        // Requirement: ====
        return this.renderRequirements(roots, 4);
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
            // Render requirement with styled ID and priority
            // Roles are defined in the theme file (e.g., pegs-theme.yml)

            let reqLine = `[.req_id]#${req.id}# `;
            if (req.priority) {
                reqLine += `[.priority]#${req.priority}# `;
            }
            reqLine += `${req.description}\n\n`;

            content += reqLine;

            if (req.attachedFiles) {
                content += this.handleAttachedFiles(req.attachedFiles, req.id);
            }

            if (req.priority || req.referenceTo) {
                content += `[cols="1,4", options="noheader", frame="none", grid="none"]\n|===\n`;
                if (req.priority) {
                    content += `|*Priority*: | [.priority]#${req.priority}#\n`;
                }
                if (req.referenceTo) {
                    const refs = req.referenceTo.split(',').map(r => r.trim());
                    const links = refs.map(r => `<<${r}>>`).join(', ');
                    content += `|*References*: | ${links}\n`;
                }
                content += `|===\n\n`;
            }

            content += `[#${req.id}]\n`;

            // Only add separator if it's a top-level requirement relative to the section
            if (level === 4) { // Adjusted level check (was 3, now 4 per previous refactor target)
                content += `---\n\n`;
            } else {
                content += `\n`;
            }

            // Render children recursively in an indented block
            if (req.children && req.children.length > 0) {
                // Using an open block with a role to apply styled indentation via theme or CSS (HTML)
                // For PDF, we need to ensure the role is handled in the theme if customized,
                // or simpler: just use AsciiDoc Indent char, but that applies to block mainly?
                // Let's use a sidebar block or just an open block with role.

                content += `[.indent]\n--\n`;
                content += this.renderRequirements(req.children, level + 1);
                content += `--\n\n`;
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
