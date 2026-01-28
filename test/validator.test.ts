import { RequirementValidator } from '../src/validator';
import { Requirement } from '../src/types';
import * as fs from 'fs';

// Mock fs to control template reading
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    },
    existsSync: jest.fn()
}));

describe('RequirementValidator', () => {
    let validator: RequirementValidator;
    const mockReadFile = fs.promises.readFile as jest.Mock;
    const mockExistsSync = fs.existsSync as jest.Mock;

    beforeEach(() => {
        validator = new RequirementValidator('templates');
        jest.clearAllMocks();

        // Mock template existence
        mockExistsSync.mockReturnValue(true);

        // Mock template content building a standard PEGS map
        mockReadFile.mockImplementation((path: string) => {
            if (path.includes('goals.adoc')) {
                return Promise.resolve(
                    '== G.1 Context and overall objective\n' +
                    '== G.2 Current situation'
                );
            }
            if (path.includes('system.adoc')) {
                return Promise.resolve(
                    '== S.1 Components\n' +
                    '== S.2 Functionality'
                );
            }
            if (path.includes('environment.adoc')) {
                return Promise.resolve('== E.1 Glossary');
            }
            if (path.includes('project.adoc')) {
                return Promise.resolve('== P.1 Roles');
            }
            return Promise.resolve('');
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
            const result = await validator.validate(reqs);
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
            const result = await validator.validate(reqs);
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
            const result = await validator.validate(reqs);
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
            const result = await validator.validate(reqs);
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
            const result = await validator.validate(reqs);
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
            const result = await validator.validate(reqs);
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
            const result = await validator.validate(reqs);
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
            const result = await validator.validate(reqs);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Parent requirement \'S.1\' not found');
        });
    });
});
