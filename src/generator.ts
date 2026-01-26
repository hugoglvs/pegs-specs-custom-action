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
            if (fileName) {
                generatedFiles.set(bookName, fileName);
            }
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

    private async generateBook(bookName: string, requirements: Requirement[]): Promise<string | null> {
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
        } else {
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

    private injectRequirements(templateContent: string, chapters: Map<string, Requirement[]>): { content: string, injected: boolean } {
        // Pre-calculate normalized chapter keys for better matching
        const normalizedChapters = new Map<string, Requirement[]>();
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
                        if (!newContent.endsWith('\n')) newContent += '\n';
                        newContent += '\n' + this.generateChapterContent(reqs) + '\n';
                        injected = true;
                    }
                } else {
                    console.log(`Skipping empty template chapter: ${chapterTitle}`);
                }
            } else {
                // Should not happen with current regex, but safety first
                newContent += section;
            }
        }
        return { content: newContent, injected };
    }

    private generateChapterContent(reqs: Requirement[]): string {
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
