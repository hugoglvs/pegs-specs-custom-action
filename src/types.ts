export interface Requirement {
    id: string;
    book: string;
    chapter: string;
    description: string;
    referenceTo?: string; // "reference to" column
    attachedFiles?: string; // "attached files" column
}

export interface ParsedRequirements {
    requirements: Requirement[];
    books: Set<string>; // Unique books found
}
