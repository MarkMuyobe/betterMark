/**
 * UserStore - V14 User credential storage.
 *
 * Simple in-memory user store for authentication.
 * In production, use a database with hashed passwords.
 */

import { createHash } from 'crypto';

/**
 * User record.
 */
export interface UserRecord {
    id: string;
    username: string;
    passwordHash: string;
    role: 'admin' | 'operator' | 'auditor';
    createdAt: Date;
    active: boolean;
}

/**
 * User store interface.
 */
export interface IUserStore {
    findByUsername(username: string): UserRecord | undefined;
    findById(id: string): UserRecord | undefined;
    validatePassword(username: string, password: string): UserRecord | undefined;
    createUser(username: string, password: string, role: UserRecord['role']): UserRecord;
}

/**
 * In-memory user store implementation.
 */
export class InMemoryUserStore implements IUserStore {
    private users: Map<string, UserRecord> = new Map();
    private byUsername: Map<string, string> = new Map(); // username -> id

    constructor() {
        // Create default admin user
        this.createUser('admin', 'admin123', 'admin');
        // Create default operator user
        this.createUser('operator', 'operator123', 'operator');
        // Create default auditor user
        this.createUser('auditor', 'auditor123', 'auditor');
    }

    /**
     * Hash a password using SHA256.
     * In production, use bcrypt or argon2.
     */
    private hashPassword(password: string): string {
        return createHash('sha256').update(password).digest('hex');
    }

    /**
     * Find user by username.
     */
    findByUsername(username: string): UserRecord | undefined {
        const id = this.byUsername.get(username.toLowerCase());
        if (!id) return undefined;
        return this.users.get(id);
    }

    /**
     * Find user by ID.
     */
    findById(id: string): UserRecord | undefined {
        return this.users.get(id);
    }

    /**
     * Validate username and password.
     */
    validatePassword(username: string, password: string): UserRecord | undefined {
        const user = this.findByUsername(username);
        if (!user) return undefined;
        if (!user.active) return undefined;

        const hash = this.hashPassword(password);
        if (user.passwordHash !== hash) return undefined;

        return user;
    }

    /**
     * Create a new user.
     */
    createUser(username: string, password: string, role: UserRecord['role']): UserRecord {
        const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const user: UserRecord = {
            id,
            username: username.toLowerCase(),
            passwordHash: this.hashPassword(password),
            role,
            createdAt: new Date(),
            active: true,
        };

        this.users.set(id, user);
        this.byUsername.set(user.username, id);

        return user;
    }

    /**
     * Deactivate a user.
     */
    deactivateUser(id: string): boolean {
        const user = this.users.get(id);
        if (user) {
            user.active = false;
            return true;
        }
        return false;
    }

    /**
     * Get all users (for admin).
     */
    getAllUsers(): UserRecord[] {
        return Array.from(this.users.values()).map(u => ({
            ...u,
            passwordHash: '[REDACTED]',
        }));
    }
}
