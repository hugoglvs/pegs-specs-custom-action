import { Requirement, ParsedRequirements } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class AdocGenerator {
    private outputDir: string;
    private templatesPath: string;

    constructor(outputDir: string, templatesPath: string) {
        this.outputDir = outputDir;
        this.templatesPath = templatesPath;
    }

    public async generate(data: ParsedRequirements): Promise<Map<string, string>> {
        // Ensure output dir exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });

        const generatedFiles = new Map<string, string>();

        // Group by Book
        const books = this.groupByBook(data.requirements);

        for (const [bookName, requirements] of books.entries()) {
            const fileName = await this.generateBook(bookName, requirements);
            generatedFiles.set(bookName, fileName);
        }

        return generatedFiles;
    }

    private groupByBook(requirements: Requirement[]): Map<string, Requirement[]> {
        const map = new Map<string, Requirement[]>();
        for (const req of requirements) {
            if (!map.has(req.book)) {
                map.set(req.book, []);
            }
            map.get(req.book)?.push(req);
        }
        return map;
    }

    private async generateBook(bookName: string, requirements: Requirement[]): Promise<string> {
        const chapters = this.groupByChapter(requirements);

        // Derive template filename from book name (e.g., "Goals Book" -> "goals.adoc")
        // Assumes typical PEGS naming: "Something Book" or just "Something". 
        // We'll take the first word or the whole thing if it's single word, lowercased.
        // Actually, let's try to be smart: "Goals Book" -> "goals.adoc". "System" -> "system.adoc"
        const templateName = bookName.toLowerCase().split(' ')[0] + '.adoc';
        const templatePath = path.join(this.templatesPath, templateName);

        let content = '';

        if (fs.existsSync(templatePath)) {
            console.log(`Using template: ${templatePath}`);
            const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
            content = this.injectRequirements(templateContent, chapters);
        } else {
            console.warn(`Template not found: ${templatePath}. Falling back to default generation.`);
            content = `= ${bookName}\n:toc:\n\n`;
            for (const [chapterName, reqs] of chapters.entries()) {
                content += `== ${chapterName}\n\n`;
                content += this.generateChapterContent(reqs);
            }
        }

        const cleanName = bookName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const fileName = `${cleanName}.adoc`;
        await fs.promises.writeFile(path.join(this.outputDir, fileName), content);
        return fileName;
    }

    private injectRequirements(templateContent: string, chapters: Map<string, Requirement[]>): string {
        // Split by lines to find headers
        const lines = templateContent.split('\n');
        let newContent = '';

        // Pre-calculate normalized chapter keys for better matching
        const normalizedChapters = new Map<string, Requirement[]>();
        for (const [title, reqs] of chapters.entries()) {
            normalizedChapters.set(title.toLowerCase().trim(), reqs);
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            newContent += line + '\n';

            // Check if this line is a level 2 header matching a chapter
            // e.g. "== Components"
            const match = line.match(/^==\s+(.+)$/);
            if (match) {
                let chapterTitle = match[1].trim();

                // Strip numbered prefix (e.g. "G.1 Context" -> "Context") related to PEGS
                const prefixMatch = chapterTitle.match(/^[A-Z]\.\d+(\.\d+)*\s+(.+)$/);
                if (prefixMatch) {
                    chapterTitle = prefixMatch[2].trim();
                }

                const normalizedTitle = chapterTitle.toLowerCase().trim();

                // Check if we have requirements for this chapter
                if (normalizedChapters.has(normalizedTitle)) {
                    const reqs = normalizedChapters.get(normalizedTitle);
                    if (reqs && reqs.length > 0) {
                        console.log(`Injecting ${reqs.length} requirements into chapter: ${chapterTitle}`);
                        newContent += '\n' + this.generateChapterContent(reqs) + '\n';
                    } else {
                        newContent += '\n_No requirements for this chapter._\n';
                    }
                } else {
                    newContent += '\n_No requirements for this chapter._\n';
                }
            }
        }
        return newContent;
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

    private groupByChapter(requirements: Requirement[]): Map<string, Requirement[]> {
        const map = new Map<string, Requirement[]>();
        for (const req of requirements) {
            if (!map.has(req.chapter)) {
                map.set(req.chapter, []);
            }
            map.get(req.chapter)?.push(req);
        }
        return map;
    }

    private handleAttachedFiles(attachedFiles: string, reqId: string): string {
        let content = '';
        const items = attachedFiles.split(';').map(s => s.trim());

        for (const item of items) {
            if (!item) continue;

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
