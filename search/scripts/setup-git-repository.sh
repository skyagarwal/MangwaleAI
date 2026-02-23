#!/bin/bash

# Complete Git Repository Setup Script
# Safely removes existing .git, initializes new repo, and merges with remote
# Repository: git@github.com:MangwaleDev/search-mangwale-ai.git

set -e  # Exit on error (except where explicitly disabled)

REPO_DIR="/home/ubuntu/Devs/Search"
REMOTE_URL="git@github.com:MangwaleDev/search-mangwale-ai.git"
REMOTE_NAME="origin"
BRANCH_NAME="main"

echo "🚀 Complete Git Repository Setup"
echo "================================================================"
echo "Repository: $REMOTE_URL"
echo "Location: $REPO_DIR"
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

# Step 3: Remove existing .git folder if it exists
if [ -d ".git" ]; then
    echo ""
    echo "🗑️  Removing existing .git folder..."
    rm -rf .git
    echo "✅ Existing .git folder removed"
else
    echo ""
    echo "ℹ️  No existing .git folder found"
fi

# Step 4: Initialize new Git repository
echo ""
echo "📦 Initializing new Git repository..."
git init
echo "✅ Git repository initialized"

# Step 5: Add remote repository
echo ""
echo "🔗 Adding remote repository..."
git remote add "$REMOTE_NAME" "$REMOTE_URL"
echo "✅ Remote added: $REMOTE_NAME -> $REMOTE_URL"

# Step 6: Fetch remote repository
echo ""
echo "📥 Fetching remote repository..."
set +e  # Don't exit on fetch error (repo might not exist yet)
git fetch "$REMOTE_NAME" 2>&1
FETCH_STATUS=$?
set -e  # Re-enable exit on error

if [ $FETCH_STATUS -ne 0 ]; then
    echo "⚠️  Failed to fetch from remote. This might be because:"
    echo "   1. The repository doesn't exist yet (will be created on first push)"
    echo "   2. SSH keys are not set up correctly"
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

# Step 7: Stage all local files (respects .gitignore)
echo ""
echo "📋 Staging local files..."
git add .
echo "✅ All files staged (respecting .gitignore)"

# Step 8: Check what will be committed
echo ""
echo "📊 Files to be committed:"
git status --short | head -20
TOTAL_FILES=$(git status --short | wc -l)
echo "   Total files: $TOTAL_FILES"
if [ $TOTAL_FILES -gt 20 ]; then
    echo "   ... and more (showing first 20)"
fi

# Step 9: Create initial commit with local changes
echo ""
echo "💾 Creating initial commit with local changes..."
git commit -m "Initial commit: Mangwale Search API - Complete System

🚀 Complete Search System Implementation

Backend:
- NestJS search API with OpenSearch integration
- Module ID based search architecture (v2)
- Full-text + semantic search with vector embeddings
- Advanced filtering (veg, price, rating, category, brand)
- Geo-location search with distance calculation
- Multi-store comparison and in-store search
- Recommendations engine
- Analytics and trending queries
- Natural language search agent
- Voice search (ASR) integration

Frontend:
- React + TypeScript + Vite
- Store dropdown + multi-select chips
- Recommendations panel
- Sorting dropdown
- Voice search button
- Search history
- Trending queries
- Responsive design
- HTTPS support

Infrastructure:
- Docker Compose setup for production
- Caddy reverse proxy with SSL/TLS
- OpenSearch 2.13.0 cluster
- MySQL sync with CDC
- Redis caching
- ClickHouse analytics
- Complete deployment guides

Documentation:
- API documentation (Swagger)
- Architecture guides
- Deployment guides
- Quick start guides
- Feature documentation"
echo "✅ Initial commit created"

# Step 10: Determine merge strategy
if [ "$REMOTE_EXISTS" = true ]; then
    # Check if remote has a main branch
    if git show-ref --verify --quiet refs/remotes/"$REMOTE_NAME"/"$BRANCH_NAME"; then
        echo ""
        echo "🔀 Remote branch '$BRANCH_NAME' exists"
        echo "   Merging local changes with remote..."
        
        # Create main branch from current commit
        git checkout -b "$BRANCH_NAME"
        
        # Try to merge remote changes
        echo ""
        echo "🔄 Attempting to merge remote changes..."
        set +e  # Don't exit on merge conflicts
        git merge "$REMOTE_NAME/$BRANCH_NAME" --no-edit --allow-unrelated-histories
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
        git checkout -b "$BRANCH_NAME"
    fi
else
    echo ""
    echo "ℹ️  Remote repository not accessible or doesn't exist"
    echo "   Creating local main branch"
    git checkout -b "$BRANCH_NAME"
fi

# Step 11: Show final status
echo ""
echo "📊 Final repository status:"
echo "================================================================"
git status
echo ""

# Step 12: Show commit history
echo "📜 Recent commits:"
git log --oneline --graph -5
echo ""

# Step 13: Show what will be pushed
if [ "$REMOTE_EXISTS" = true ] && git show-ref --verify --quiet refs/remotes/"$REMOTE_NAME"/"$BRANCH_NAME"; then
    LOCAL_COMMITS=$(git rev-list "$REMOTE_NAME/$BRANCH_NAME"..HEAD 2>/dev/null | wc -l || echo "0")
    if [ "$LOCAL_COMMITS" -gt 0 ]; then
        echo "📤 Local commits ahead of remote: $LOCAL_COMMITS"
        echo ""
        echo "Commits to push:"
        git log --oneline "$REMOTE_NAME/$BRANCH_NAME"..HEAD 2>/dev/null
    else
        echo "✅ Local and remote are in sync"
    fi
else
    echo "📤 Ready to push (will create remote branch)"
fi
echo ""

# Step 14: Instructions for pushing
echo "🚀 Next Steps:"
echo "================================================================"
echo "To push your changes to remote, run:"
echo ""
echo "  git push -u $REMOTE_NAME $BRANCH_NAME"
echo ""
echo "If you need to force push (⚠️  use with caution, only if remote is empty or you're sure):"
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

