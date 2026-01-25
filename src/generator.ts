import { Requirement, ParsedRequirements } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class AdocGenerator {
    private outputDir: string;

    constructor(outputDir: string) {
        this.outputDir = outputDir;
    }

    public async generate(data: ParsedRequirements): Promise<void> {
        // Ensure output dir exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });

        // Group by Book
        const books = this.groupByBook(data.requirements);

        for (const [bookName, requirements] of books.entries()) {
            await this.generateBook(bookName, requirements);
        }
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

    private async generateBook(bookName: string, requirements: Requirement[]): Promise<void> {
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
        const items = attachedFiles.split(';').map(s => s.trim()); // Support multiple with semicolon

        for (const item of items) {
            if (!item) continue;

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
