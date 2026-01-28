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

        // Index requirements by Book then Chapter for easy lookup
        // Use ID prefixes to match structure if possible, but req has explicit strings.
        // We'll map structure title -> req.book? 
        // Better: We iterate the STRUCTURE. For each book in structure, we find matching reqs.

        // Group reqs by Book Name (normalized)
        const reqsByBookKey = new Map<string, Requirement[]>();
        for (const req of data.requirements) {
            const key = req.book.toLowerCase().trim();
            if (!reqsByBookKey.has(key)) reqsByBookKey.set(key, []);
            reqsByBookKey.get(key)?.push(req);
        }

        for (const bookNode of structure.books) {
            const fileName = await this.generateBookFromStructure(bookNode, reqsByBookKey);
            generatedFiles.set(bookNode.title, fileName);
        }

        return generatedFiles;
    }

    private async generateBookFromStructure(bookNode: StructureNode, reqsByBookKey: Map<string, Requirement[]>): Promise<string> {
        let content = `= ${bookNode.title}\n:toc:\n\n`;
        content += `${bookNode.description}\n\n`;

        // Get requirements for this book
        const bookReqs = reqsByBookKey.get(bookNode.title.toLowerCase().trim()) || [];

        // Group by Chapter
        const reqsByChapterKey = new Map<string, Requirement[]>();
        for (const req of bookReqs) {
            const cKey = req.chapter.toLowerCase().trim();
            if (!reqsByChapterKey.has(cKey)) reqsByChapterKey.set(cKey, []);
            reqsByChapterKey.get(cKey)?.push(req);
        }

        for (const chapterNode of bookNode.children) {
            content += `== ${chapterNode.id} ${chapterNode.title}\n`;
            content += `${chapterNode.description}\n\n`;

            const chapterReqs = reqsByChapterKey.get(chapterNode.title.toLowerCase().trim());

            if (chapterReqs && chapterReqs.length > 0) {
                content += this.generateChapterContent(chapterReqs) + '\n';
            } else {
                content += `_No requirements for this chapter._\n\n`;
            }
        }

        // Clean filename: "Goals Book" -> "goals.adoc"
        // Try to keep consistent with old naming if possible, default to sanitized title
        let baseName = bookNode.title.toLowerCase().split(' ')[0]; // "goals"
        if (baseName.length < 3) baseName = bookNode.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        const fileName = `${baseName}.adoc`;
        await fs.promises.writeFile(path.join(this.outputDir, fileName), content);
        return fileName;
    }


    private generateChapterContent(reqs: Requirement[]): string {
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
                // It's a root (no parent, or parent not in this chapter context)
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
            // Only add separator if it's a top-level requirement relative to the chapter
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

            const caption = `.Visual for ${reqId}`;

            if (item.match(/\.puml$/i)) {
                content += `\n${caption}\nplantuml::${item}[format=svg, target=diagram-${reqId}, align=center]\n\n`;
            }
            else if (item.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
                content += `\n${caption}\nimage::${item}[${reqId} Image, align=center]\n\n`;
            }
            else {
                content += `\nlink:${item}[Attached File]\n\n`;
            }
        }
        return content;
    }
}
