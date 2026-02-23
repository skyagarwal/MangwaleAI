#!/bin/bash

# Git Repository Setup Script for MangwaleDev/search-mangwale-ai
# This script safely connects local Search folder to remote repository
# and merges local changes with existing remote code

# Don't exit on error for merge operations (conflicts are expected)
set +e  # Allow errors for merge operations

REPO_DIR="/home/ubuntu/Devs/Search"
REMOTE_URL="git@github.com:MangwaleDev/search-mangwale-ai.git"
REMOTE_NAME="origin"
BRANCH_NAME="main"

echo "🚀 Setting up Git repository for MangwaleDev/search-mangwale-ai"
echo "================================================================"
echo ""

# Step 1: Navigate to repository directory
cd "$REPO_DIR"
echo "✅ Changed to directory: $REPO_DIR"

# Step 2: Configure Git user (global)
echo ""
echo "📝 Configuring Git user..."
git config --global user.email "mangwale.backend@gmail.com"
git config --global user.name "MangwaleDev"
echo "✅ Git user configured:"
echo "   Name: $(git config --global user.name)"
echo "   Email: $(git config --global user.email)"

# Step 3: Check if .git already exists
if [ -d ".git" ]; then
    echo ""
    echo "⚠️  Git repository already initialized"
    echo "   Checking current status..."
    git status --short || true
else
    echo ""
    echo "📦 Initializing Git repository..."
    git init
    echo "✅ Git repository initialized"
fi

# Step 4: Check if remote already exists
if git remote get-url "$REMOTE_NAME" &>/dev/null; then
    echo ""
    echo "⚠️  Remote '$REMOTE_NAME' already exists"
    CURRENT_URL=$(git remote get-url "$REMOTE_NAME")
    echo "   Current URL: $CURRENT_URL"
    
    if [ "$CURRENT_URL" != "$REMOTE_URL" ]; then
        echo "   Updating remote URL to: $REMOTE_URL"
        git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
        echo "✅ Remote URL updated"
    else
        echo "✅ Remote URL is correct"
    fi
else
    echo ""
    echo "🔗 Adding remote repository..."
    git remote add "$REMOTE_NAME" "$REMOTE_URL"
    echo "✅ Remote added: $REMOTE_NAME -> $REMOTE_URL"
fi

# Step 5: Stage all local changes
echo ""
echo "📋 Staging local changes..."
git add .
echo "✅ All files staged"

# Step 6: Check if there are changes to commit
if git diff --cached --quiet; then
    echo ""
    echo "ℹ️  No changes to commit (working directory clean)"
    HAS_LOCAL_COMMITS=false
else
    echo ""
    echo "💾 Committing local changes..."
    git commit -m "Local changes: Mangwale Search API

- Complete Search system with module_id architecture
- NestJS backend API with OpenSearch integration
- React frontend with Vite
- Docker Compose setup for production
- Caddy reverse proxy with SSL/TLS
- Semantic search with vector embeddings
- Full-text search with faceting
- Analytics and trending queries
- Natural language search agent
- Complete documentation and deployment guides"
    echo "✅ Local changes committed"
    HAS_LOCAL_COMMITS=true
fi

# Step 7: Fetch remote repository
echo ""
echo "📥 Fetching remote repository..."
set +e  # Don't exit on fetch error (repo might not exist yet)
git fetch "$REMOTE_NAME" 2>&1
FETCH_STATUS=$?
set -e  # Re-enable exit on error

if [ $FETCH_STATUS -ne 0 ]; then
    echo "⚠️  Failed to fetch from remote. This might be because:"
    echo "   1. The repository doesn't exist yet (will be created on first push)"
    echo "   2. SSH keys are not set up"
    echo "   3. You don't have access to the repository"
    echo ""
    echo "Please verify:"
    echo "   - Repository exists: $REMOTE_URL"
    echo "   - SSH keys are configured: ssh -T git@github.com"
    echo "   - You have access to MangwaleDev/search-mangwale-ai"
    echo ""
    echo "Continuing with local setup. You can push later after fixing access."
    REMOTE_EXISTS=false
else
    echo "✅ Remote repository fetched"
    REMOTE_EXISTS=true
fi

# Step 8: Check what branches exist on remote
REMOTE_BRANCHES=$(git branch -r | grep "$REMOTE_NAME/" | sed "s|$REMOTE_NAME/||" | tr '\n' ' ')
echo ""
echo "📌 Remote branches found: $REMOTE_BRANCHES"

# Step 9: Determine merge strategy
if [ "$REMOTE_EXISTS" = true ] && git show-ref --verify --quiet refs/remotes/"$REMOTE_NAME"/"$BRANCH_NAME"; then
    echo ""
    echo "🔀 Remote branch '$BRANCH_NAME' exists"
    echo "   Merging local changes with remote..."
    
    # Check if we have a local branch
    if git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
        echo "   Local branch '$BRANCH_NAME' exists"
        git checkout "$BRANCH_NAME"
    else
        echo "   Creating local branch '$BRANCH_NAME'"
        git checkout -b "$BRANCH_NAME"
    fi
    
    # Try to merge
    echo ""
    echo "🔄 Attempting to merge remote changes..."
    set +e  # Don't exit on merge conflicts
    git merge "$REMOTE_NAME/$BRANCH_NAME" --no-edit --no-ff
    MERGE_STATUS=$?
    set -e  # Re-enable exit on error
    
    if [ $MERGE_STATUS -eq 0 ]; then
        echo "✅ Successfully merged remote changes"
    else
        echo ""
        echo "⚠️  Merge conflicts detected!"
        echo "   Please resolve conflicts manually:"
        echo "   1. Review conflicts: git status"
        echo "   2. Edit conflicted files (look for <<<<<<, ======, >>>>>> markers)"
        echo "   3. Stage resolved files: git add <file>"
        echo "   4. Complete merge: git commit"
        echo ""
        echo "   Or to abort merge: git merge --abort"
        echo ""
        echo "   After resolving conflicts, you can push with:"
        echo "   git push -u $REMOTE_NAME $BRANCH_NAME"
        exit 1
    fi
else
    echo ""
    echo "ℹ️  Remote branch '$BRANCH_NAME' doesn't exist yet"
    echo "   Will create it on first push"
    
    # Ensure we're on main branch
    if ! git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
        git checkout -b "$BRANCH_NAME"
        echo "✅ Created local branch '$BRANCH_NAME'"
    else
        git checkout "$BRANCH_NAME"
        echo "✅ Switched to branch '$BRANCH_NAME'"
    fi
fi

# Step 10: Rename branch to main if needed
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    echo ""
    echo "🔄 Renaming branch to '$BRANCH_NAME'..."
    git branch -M "$BRANCH_NAME"
    echo "✅ Branch renamed to '$BRANCH_NAME'"
fi

# Step 11: Show status
echo ""
echo "📊 Current repository status:"
echo "================================================================"
git status
echo ""

# Step 12: Show what will be pushed
echo "📤 Ready to push! Summary:"
echo "================================================================"
echo "Remote: $REMOTE_NAME -> $REMOTE_URL"
echo "Branch: $BRANCH_NAME"
echo ""
LOCAL_COMMITS=$(git rev-list "$REMOTE_NAME/$BRANCH_NAME"..HEAD 2>/dev/null | wc -l || echo "0")
if [ "$LOCAL_COMMITS" -gt 0 ]; then
    echo "Local commits ahead of remote: $LOCAL_COMMITS"
    echo ""
    echo "Recent commits:"
    git log --oneline "$REMOTE_NAME/$BRANCH_NAME"..HEAD 2>/dev/null || git log --oneline -5
else
    echo "No new commits to push (already in sync)"
fi
echo ""

# Step 13: Instructions for pushing
echo "🚀 Next steps:"
echo "================================================================"
echo "To push your changes to remote, run:"
echo ""
echo "  git push -u $REMOTE_NAME $BRANCH_NAME"
echo ""
echo "Or if you need to force push (⚠️  use with caution):"
echo "  git push -u $REMOTE_NAME $BRANCH_NAME --force"
echo ""
echo "To verify remote connection:"
echo "  git remote -v"
echo ""
echo "To check branch status:"
echo "  git status"
echo "  git log --oneline --graph --all -10"
echo ""

echo "✅ Git repository setup complete!"
echo "================================================================"

