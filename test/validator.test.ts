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
        parts: [
            {
                id: 'G', type: 'Part', title: 'Goals Book', description: '...', required: false, children: [
                    { id: 'G.1', type: 'Section', title: 'Context and overall objective', description: '...', required: false, children: [] },
                    { id: 'G.2', type: 'Section', title: 'Current situation', description: '...', required: false, children: [] }
                ]
            },
            {
                id: 'S', type: 'Part', title: 'System Book', description: '...', required: false, children: [
                    { id: 'S.1', type: 'Section', title: 'Components', description: '...', required: false, children: [] },
                    { id: 'S.2', type: 'Section', title: 'Functionality', description: '...', required: false, children: [] }
                ]
            },
            {
                id: 'P', type: 'Part', title: 'Project Book', description: '...', required: false, children: [
                    { id: 'P.1', type: 'Section', title: 'Roles', description: '...', required: false, children: [] }
                ]
            },
            {
                id: 'E', type: 'Part', title: 'Environment Book', description: '...', required: false, children: [
                    { id: 'E.1', type: 'Section', title: 'Glossary', description: '...', required: false, children: [] }
                ]
            }
        ],
        partMap: new Map() // We don't use partMap in validator currently, only structure.parts traversal
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
                part: 'System Book',
                section: 'Components',
                description: 'test'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should validate a nested ID consistent with parent', async () => {
            const reqs: Requirement[] = [{
                id: 'G.1.2',
                part: 'Goals Book',
                section: 'Context and overall objective',
                description: 'parent'
            }, {
                id: 'G.1.2.1',
                part: 'Goals Book',
                section: 'Context and overall objective',
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
                part: 'System Book',
                section: 'Components',
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
                part: 'System Book',
                section: 'Components',
                description: 'bad'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('ID format invalid');
        });

        it('should fail when Part letter mismatches', async () => {
            const reqs: Requirement[] = [{
                id: 'G.1.1', // G matches Goals Book, but...
                part: 'System Book', // ...we say it is System Book (Expect S)
                section: 'Components',
                description: 'mismatch'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('expected \'S\'');
        });

        it('should fail when Section number mismatches', async () => {
            const reqs: Requirement[] = [{
                id: 'S.2.1', // Indicates section 2
                part: 'System Book',
                section: 'Components', // Mocks say Components is S.1
                description: 'mismatch'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('expected 1');
        });

        it('should fail when Parent ID is not a prefix of Child ID', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.2',
                part: 'System Book',
                section: 'Components',
                parent: 'S.2', // Child S.1.2 is NOT child of S.2
                description: 'bad parent'
            }, {
                id: 'S.2', // Dummy parent to satisfy existence check
                part: 'System Book',
                section: 'Functionality',
                description: 'parent'
            }];
            const result = validator.validate(reqs, mockStructure);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Child ID must start with Parent ID');
        });

        it('should fail when Parent requirement does not exist', async () => {
            const reqs: Requirement[] = [{
                id: 'S.1.2',
                part: 'System Book',
                section: 'Components',
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
                part: 'System Book',
                section: 'Components',
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
                part: 'System Book',
                section: 'Components',
                description: 'existing file',
                attachedFiles: 'existing.png'
            }];
            const result = validator.validate(reqs, mockStructure);
            if (!result.isValid) console.error(result.errors);
            expect(result.isValid).toBe(true);
        });
    });
});

