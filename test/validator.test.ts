import { RequirementValidator } from '../src/validator';
import { Requirement } from '../src/types';
import { Structure } from '../src/structure';
import * as fs from 'fs';

// Mock fs to control attached file reading
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    },
    existsSync: jest.fn()
}));

describe('RequirementValidator', () => {
    let validator: RequirementValidator;
    const mockExistsSync = fs.existsSync as jest.Mock;

    // Create a mock structure that mimics the PEGS standard
    const mockStructure: Structure = {
        books: [
            {
                id: 'G', title: 'Goals Book', description: '...', children: [
                    { id: 'G.1', title: 'Context and overall objective', description: '...', children: [] },
                    { id: 'G.2', title: 'Current situation', description: '...', children: [] }
                ]
            },
            {
                id: 'S', title: 'System Book', description: '...', children: [
                    { id: 'S.1', title: 'Components', description: '...', children: [] },
                    { id: 'S.2', title: 'Functionality', description: '...', children: [] }
                ]
            },
            {
                id: 'P', title: 'Project Book', description: '...', children: [
                    { id: 'P.1', title: 'Roles', description: '...', children: [] }
                ]
            },
            {
                id: 'E', title: 'Environment Book', description: '...', children: [
                    { id: 'E.1', title: 'Glossary', description: '...', children: [] }
                ]
            }
        ],
        bookMap: new Map() // We don't use bookMap in validator currently, only structure.books traversal
    };

    beforeEach(() => {
        validator = new RequirementValidator();
        jest.clearAllMocks();

        // Mock attached file existence
        mockExistsSync.mockImplementation((path: string) => {
            if (path === 'existing.png') return true;
            return false;
        });
    });

    describe('Valid Requirements (Happy Path)', () => {
        it('should validate a simple correct ID', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.1',
                book: 'System Book',
                chapter: 'Components',
                description: 'test'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate a nested ID consistent with parent', async () => {
            const reqs: Requirement[] = [{
                id: 'G.1.2',
                book: 'Goals Book',
                chapter: 'Context and overall objective',
                description: 'parent'
            }, {
                id: 'G.1.2.1',
                book: 'Goals Book',
                chapter: 'Context and overall objective',
                parent: 'G.1.2',
                description: 'test'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(true);
        });
    });

    describe('Warnings', () => {
        it('should warn on deep nesting (> 6 levels)', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.2.3.4.5.6.7', // 7 levels
                book: 'System Book',
                chapter: 'Components',
                description: 'deep'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(true); // Still valid format
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0]).toContain('Nesting is very deep');
        });
    });

    describe('Invalid Requirements (Failures)', () => {
        it('should fail on invalid ID format', async () => {
            const reqs: Requirement[] = [{
                id: 'S-1', // Invalid separator
                book: 'System Book',
                chapter: 'Components',
                description: 'bad'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('ID format invalid');
        });

        it('should fail when Book letter mismatches', async () => {
            const reqs: Requirement[] = [{
                id: 'G.1.1', // G matches Goals Book, but...
                book: 'System Book', // ...we say it is System Book (Expect S)
                chapter: 'Components',
                description: 'mismatch'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('expected \'S\'');
        });

        it('should fail when Chapter number mismatches', async () => {
            const reqs: Requirement[] = [{
                id: 'S.2.1', // Indicates chapter 2
                book: 'System Book',
                chapter: 'Components', // Mocks say Components is S.1
                description: 'mismatch'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('expected 1');
        });

        it('should fail when Parent ID is not a prefix of Child ID', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.2',
                book: 'System Book',
                chapter: 'Components',
                parent: 'S.2', // Child S.1.2 is NOT child of S.2
                description: 'bad parent'
            }, {
                id: 'S.2', // Dummy parent to satisfy existence check
                book: 'System Book',
                chapter: 'Functionality',
                description: 'parent'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Child ID must start with Parent ID');
        });

        it('should fail when Parent requirement does not exist', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.2',
                book: 'System Book',
                chapter: 'Components',
                parent: 'S.1', // S.1 is missing from this list
                description: 'missing parent'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Parent requirement \'S.1\' not found');
        });

        it('should fail when attached file does not exist', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.3',
                book: 'System Book',
                chapter: 'Components',
                description: 'missing file',
                attachedFiles: 'missing.png'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Attached file \'missing.png\' not found');
        });

        it('should pass when attached file exists', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.4',
                book: 'System Book',
                chapter: 'Components',
                description: 'existing file',
                attachedFiles: 'existing.png'
            }];
            const result = validator.validate(reqs, mockStructure);
            if (!result.isValid) console.error(result.errors);
            expect(result.isValid).toBe(true);
        });
    });
});

