import { Requirement } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export class RequirementValidator {
    private templatesPath: string;
    // Map<BookName, Map<ChapterNameNormalized, ChapterNumber>>
    private bookChapterIndex: Map<string, Map<string, number>>;

    constructor(templatesPath: string) {
        this.templatesPath = templatesPath;
        this.bookChapterIndex = new Map();
    }

    public async validate(requirements: Requirement[]): Promise<ValidationResult> {
        const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

        await this.buildChapterIndex();

        // Build set of valid IDs for referential integrity
        const validIds = new Set(requirements.map(r => r.id));

        for (const req of requirements) {
            this.validateIDFormat(req, result);
            this.validateNestingDepth(req, result);
            this.validateParentExistence(req, validIds, result);
            this.validateAttachedFiles(req, result);
        }

        return result;
    }

    private async buildChapterIndex() {
        // Known PEGS books and valid prefixes
        const bookFiles = new Map([
            ['Goals Book', { file: 'goals.adoc', letter: 'G' }],
            ['Environment Book', { file: 'environment.adoc', letter: 'E' }],
            ['Project Book', { file: 'project.adoc', letter: 'P' }],
            ['System Book', { file: 'system.adoc', letter: 'S' }]
        ]);

        for (const [bookName, info] of bookFiles.entries()) {
            const templatePath = path.join(this.templatesPath, info.file);
            if (!fs.existsSync(templatePath)) continue;

            const content = await fs.promises.readFile(templatePath, 'utf-8');
            const chapterMap = new Map<string, number>();

            const lines = content.split('\n');
            for (const line of lines) {
                // Match "== G.1 Context..."
                const match = line.match(/^==\s+([A-Z])\.(\d+)\s+(.+)$/);
                if (match) {
                    const chapterNum = parseInt(match[2], 10);
                    const chapterTitle = match[3].trim();
                    chapterMap.set(chapterTitle.toLowerCase(), chapterNum);
                }
            }
            this.bookChapterIndex.set(bookName, chapterMap);
        }
    }

    private validateIDFormat(req: Requirement, result: ValidationResult) {
        // Regex: Letter.Num.Num...
        // e.g. G.1.2 or G.3.1.2.5
        const idPattern = /^[GEPS]\.\d+(\.\d+)*$/;

        if (!idPattern.test(req.id)) {
            result.errors.push(`Requirement ${req.id}: ID format invalid. Must be <Letter>.<Chapter>.<ID> (e.g., G.1.1).`);
            result.isValid = false;
            return;
        }

        const parts = req.id.split('.');
        const letter = parts[0];
        const chapterNum = parseInt(parts[1], 10);

        // Check consistency with Book
        const bookLetterMap: { [key: string]: string } = {
            'Goals Book': 'G',
            'Environment Book': 'E',
            'Project Book': 'P',
            'System Book': 'S'
        };

        const expectedLetter = bookLetterMap[req.book];
        if (expectedLetter && letter !== expectedLetter) {
            result.errors.push(`Requirement ${req.id}: ID starts with '${letter}' but belongs to '${req.book}' (expected '${expectedLetter}').`);
            result.isValid = false;
        }

        // Check consistency with Chapter
        const bookChapters = this.bookChapterIndex.get(req.book);
        if (bookChapters) {
            const normalizedChapterTitle = req.chapter.toLowerCase().trim();
            const expectedChapterNum = bookChapters.get(normalizedChapterTitle);

            if (expectedChapterNum !== undefined && chapterNum !== expectedChapterNum) {
                result.errors.push(`Requirement ${req.id}: ID indicates chapter ${chapterNum} but belongs to chapter "${req.chapter}" (expected ${expectedChapterNum}).`);
                result.isValid = false;
            }
        }

        // Check Parent consistency
        if (req.parent) {
            if (!req.id.startsWith(req.parent + '.')) {
                result.errors.push(`Requirement ${req.id}: ID consistent with parent ${req.parent}. Child ID must start with Parent ID.`);
                result.isValid = false;
            }
        }
    }

    private validateNestingDepth(req: Requirement, result: ValidationResult) {
        // G.1.2 -> depth 3 (parts length)
        // We consider "G.1.2" as depth 1 relative to chapter? 
        // Request: "warn if deep". Let's say max 6 parts (e.g. G.1.2.3.4.5)

        const parts = req.id.split('.');
        if (parts.length > 6) {
            result.warnings.push(`Requirement ${req.id}: Nesting is very deep (${parts.length} levels). Consider refactoring.`);
        }
    }

    private validateParentExistence(req: Requirement, validIds: Set<string>, result: ValidationResult) {
        if (req.parent) {
            if (!validIds.has(req.parent)) {
                result.errors.push(`Requirement ${req.id}: Parent requirement '${req.parent}' not found. Top-level requirements should have an empty parent field.`);
                result.isValid = false;
            }
        }
    }

    private validateAttachedFiles(req: Requirement, result: ValidationResult) {
        if (req.attachedFiles) {
            // Assume single file path or comma-separated
            const filePaths = req.attachedFiles.split(',').map(p => p.trim());
            for (const filePath of filePaths) {
                if (!filePath) continue;
                if (!fs.existsSync(filePath)) {
                    result.errors.push(`Requirement ${req.id}: Attached file '${filePath}' not found.`);
                    result.isValid = false;
                }
            }
        }
    }
}
