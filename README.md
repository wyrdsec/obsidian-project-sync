# Obsidian Project Sync

A plugin to recursively copy Obsidian Vault files to a location on disk.  
Configurable through codeblocks, allowing for files to be excluded with regex.

## Example

The only keywords allowed are `path` and `exclude`.  
Any number of either arguments is allowed, but only the last `path` keyword is used.

~~~~
```projsync
path /home/wyrd/Documents/some_git_repo/notes/
exclude exclude_me.md
exclude .json$
exclude ^test
```
~~~~

![Result](img/example.png)