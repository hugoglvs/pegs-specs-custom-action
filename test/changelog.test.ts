import { getChangelog, generateChangelogAdoc } from '../src/changelog';
import * as exec from '@actions/exec';

jest.mock('@actions/exec');

describe('Changelog', () => {
    it('should parse git tag output correctly', async () => {
        const mockExec = exec.exec as jest.Mock;
        mockExec.mockImplementation((cmd, args, options) => {
            if (options && options.listeners && options.listeners.stdout) {
                // Mocking output of: git tag -n1 --sort=-creatordate --format=%(refname:short)|%(creatordate:short)|%(contents:subject)
                const output = `v1.1.0|2023-01-02|Feature B\nv1.0.0|2023-01-01|Initial Release\n`;
                options.listeners.stdout(Buffer.from(output));
            }
            return Promise.resolve(0);
        });

        const entries = await getChangelog();
        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual({ version: 'v1.1.0', date: '2023-01-02', comment: 'Feature B' });
        expect(entries[1]).toEqual({ version: 'v1.0.0', date: '2023-01-01', comment: 'Initial Release' });
    });

    it('should handle empty output gracefully', async () => {
        const mockExec = exec.exec as jest.Mock;
        mockExec.mockImplementation((cmd, args, options) => {
            return Promise.resolve(0);
        });

        const entries = await getChangelog();
        expect(entries).toHaveLength(0);
    });

    it('should generate AsciiDoc table', () => {
        const entries = [
            { version: 'v1.0', date: '2023-01-01', comment: 'Test' }
        ];
        const adoc = generateChangelogAdoc(entries);
        expect(adoc).toContain('| Version | Date | Description');
        expect(adoc).toContain('| v1.0 | 2023-01-01 | Test');
    });

    it('should return empty string for empty entries', () => {
        const adoc = generateChangelogAdoc([]);
        expect(adoc).toBe('');
    });
});
