#!/bin/sh

echo "Installing git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh

echo "Running tests before commit..."

# Run npm test
npm test

# Capture the exit code
TEST_EXIT_CODE=$?

# If tests fail, prevent the commit
if [ $TEST_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Tests failed. Commit aborted."
  echo "Fix the failing tests before committing."
  exit 1
fi

echo "✅ All tests passed. Proceeding with commit."
exit 0
EOF

# Make the hook executable
chmod +x .git/hooks/pre-commit

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-commit hook will now run tests before each commit."
echo "To bypass the hook (not recommended), use: git commit --no-verify"
