import type { Author, GitCommit, GitTag } from "./git-parser.ts";

/**
 * Validation result containing status and optional error message.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an email address format.
 * Accepts basic email patterns (doesn't need to be RFC-compliant).
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: "Email cannot be empty" };
  }

  // Basic email validation - just check for @ and domain
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: `Invalid email format: ${email}` };
  }

  if (email.length > 255) {
    return { valid: false, error: "Email exceeds 255 characters" };
  }

  return { valid: true };
}

/**
 * Validates a Git SHA hash.
 */
export function validateSha(sha: string): ValidationResult {
  if (!sha || sha.trim().length === 0) {
    return { valid: false, error: "SHA cannot be empty" };
  }

  // Git SHAs are 40 character hex strings (can be shortened to 7-8 chars)
  if (sha.length < 7 || sha.length > 40) {
    return { valid: false, error: `Invalid SHA length: ${sha}` };
  }

  const shaRegex = /^[a-f0-9]+$/i;
  if (!shaRegex.test(sha)) {
    return { valid: false, error: `Invalid SHA format (must be hex): ${sha}` };
  }

  return { valid: true };
}

/**
 * Validates a repository name.
 */
export function validateRepoName(repoName: string): ValidationResult {
  if (!repoName || repoName.trim().length === 0) {
    return { valid: false, error: "Repository name cannot be empty" };
  }

  if (repoName.length > 255) {
    return { valid: false, error: "Repository name exceeds 255 characters" };
  }

  return { valid: true };
}

/**
 * Validates a file path.
 */
export function validateFilePath(filePath: string): ValidationResult {
  if (!filePath || filePath.trim().length === 0) {
    return { valid: false, error: "File path cannot be empty" };
  }

  if (filePath.length > 4096) {
    return { valid: false, error: "File path exceeds 4096 characters" };
  }

  return { valid: true };
}

/**
 * Validates a commit object.
 * Returns array of validation errors (empty if valid).
 */
export function validateCommit(commit: GitCommit): string[] {
  const errors: string[] = [];

  const shaResult = validateSha(commit.sha);
  if (!shaResult.valid) {
    errors.push(shaResult.error!);
  }

  const emailResult = validateEmail(commit.authorEmail);
  if (!emailResult.valid) {
    errors.push(emailResult.error!);
  }

  if (!commit.authorName || commit.authorName.trim().length === 0) {
    errors.push("Author name cannot be empty");
  }

  if (commit.authorName.length > 255) {
    errors.push("Author name exceeds 255 characters");
  }

  if (!commit.committedAt || !(commit.committedAt instanceof Date)) {
    errors.push("Committed date is invalid");
  }

  if (commit.message.length > 65535) {
    errors.push("Commit message exceeds maximum length");
  }

  if (commit.additions < 0 || commit.deletions < 0 || commit.filesChanged < 0) {
    errors.push("Addition/deletion/file counts cannot be negative");
  }

  return errors;
}

/**
 * Validates an author object.
 * Returns array of validation errors (empty if valid).
 */
export function validateAuthor(author: Author): string[] {
  const errors: string[] = [];

  const emailResult = validateEmail(author.email);
  if (!emailResult.valid) {
    errors.push(emailResult.error!);
  }

  if (!author.name || author.name.trim().length === 0) {
    errors.push("Author name cannot be empty");
  }

  if (author.name.length > 255) {
    errors.push("Author name exceeds 255 characters");
  }

  if (author.totalCommits < 1) {
    errors.push("Author must have at least 1 commit");
  }

  if (author.firstCommitAt > author.lastCommitAt) {
    errors.push("First commit date cannot be after last commit date");
  }

  return errors;
}

/**
 * Validates a tag object.
 * Returns array of validation errors (empty if valid).
 */
export function validateTag(tag: GitTag): string[] {
  const errors: string[] = [];

  if (!tag.tagName || tag.tagName.trim().length === 0) {
    errors.push("Tag name cannot be empty");
  }

  if (tag.tagName.length > 255) {
    errors.push("Tag name exceeds 255 characters");
  }

  const shaResult = validateSha(tag.sha);
  if (!shaResult.valid) {
    errors.push(shaResult.error!);
  }

  // For annotated tags, validate tagger info
  if (tag.isAnnotated) {
    if (tag.taggerEmail) {
      const emailResult = validateEmail(tag.taggerEmail);
      if (!emailResult.valid) {
        errors.push(emailResult.error!);
      }
    }

    if (tag.taggerName && tag.taggerName.length > 255) {
      errors.push("Tagger name exceeds 255 characters");
    }

    if (tag.message && tag.message.length > 65535) {
      errors.push("Tag message exceeds maximum length");
    }
  }

  return errors;
}
