export interface IJournalEntry {
    id: string;
    date: Date;
    content: string; // Text content
    tags: string[];

    // Placeholders for media
    imageUrls?: string[];
    audioUrls?: string[];
    createdAt: Date;
}
