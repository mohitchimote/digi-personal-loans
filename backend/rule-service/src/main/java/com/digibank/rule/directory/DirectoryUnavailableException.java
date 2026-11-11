package com.digibank.rule.directory;

/** auth-service could not be asked. A mandate that depends on the answer is refused (503) rather than guessed:
 * guessing could grant authority the person does not have. */
public class DirectoryUnavailableException extends RuntimeException {
    public DirectoryUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
