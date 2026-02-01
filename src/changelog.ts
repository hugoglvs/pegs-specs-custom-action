import * as exec from '@actions/exec';

export interface ChangelogEntry {
    version: string;
    date: string;
    comment: string;
}

export async function getChangelog(): Promise<ChangelogEntry[]> {
    const entries: ChangelogEntry[] = [];
    let output = '';

    const options: exec.ExecOptions = {
        listeners: {
            stdout: (data: Buffer) => {
                output += data.toString();
            }
        },
        silent: true,
        ignoreReturnCode: true // Don't fail if no tags
    };

    // Format: Version|Date|Subject
    // Use --sort=-creatordate to get newest first
    // Note: %(contents:subject) works for annotated tags. For lightweight tags, it might be empty.
    // We try to capture standard tag usage.
    try {
        await exec.exec('git', ['tag', '-n1', '--sort=-creatordate', '--format=%(refname:short)|%(creatordate:short)|%(contents:subject)'], options);
    } catch (error) {
        console.warn('Failed to fetch tags for changelog:', error);
        return [];
    }

    const lines = output.trim().split('\n');
    for (const line of lines) {
        if (!line) continue;
        const parts = line.split('|');
        if (parts.length >= 3) {
            entries.push({
                version: parts[0].trim(),
                date: parts[1].trim(),
                comment: parts.slice(2).join('|').trim() // Rejoin in case pipe in comment
            });
        }
    }

    return entries;
}

export function generateChangelogAdoc(entries: ChangelogEntry[]): string {
    if (entries.length === 0) {
        return '';
    }

    let content = '[discrete]\n== Changelog\n\n';
    content += '[cols="1,1,3", options="header"]\n';
    content += '|===\n';
    content += '| Version | Date | Description\n';

    for (const entry of entries) {
        content += `| ${entry.version} | ${entry.date} | ${entry.comment}\n`;
    }

    content += '|===\n';
    return content;
}
