# Obsidian Project Sync

A plugin to recursively copy Obsidian Vault files to a location on disk.  
Configurable through codeblocks, allowing for files to be excluded with regex.

## Example

The only keywords allowed are `path` and `exclude`.  
Any number of either arguments is allowed, but only the last `path` keyword is used.

~~~~
```projsync
# Set path to sync to
path ~/Documents/some_git_repo/notes/

# Exclude the file exclude_me.md
exclude exclude_me.md

# Exclude any file ending in '.json'
exclude .json$

# Exclude any file starting with 'test'
exclude ^test
```
~~~~

![Result](img/example.png)