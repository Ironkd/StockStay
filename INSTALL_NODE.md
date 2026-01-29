# Installing Node.js on macOS

You need to install Node.js first before you can run the app. Here are the easiest ways:

## Option 1: Download Installer (Easiest - Recommended)

1. **Go to**: https://nodejs.org/
2. **Download** the "LTS" (Long Term Support) version for macOS
3. **Open** the downloaded `.pkg` file
4. **Follow** the installation wizard
5. **Restart** your Terminal after installation

Then verify it worked:
```bash
node --version
npm --version
```

## Option 2: Install Homebrew First, Then Node.js

If you want to use Homebrew (package manager for Mac):

### Install Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts. After installation, you might need to add Homebrew to your PATH:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Then install Node.js:
```bash
brew install node
```

## Option 3: Using nvm (Node Version Manager)

If you want to manage multiple Node.js versions:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart Terminal, then:
nvm install --lts
nvm use --lts
```

## After Installation

Once Node.js is installed, come back and run:

```bash
cd ~/inventory-app
npm install
cd server
npm install
```

## Troubleshooting

### "Command not found" after installation

**Restart your Terminal** - This is important! Close and reopen Terminal.app.

If that doesn't work, add Node.js to your PATH manually:
```bash
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Check if Node.js is installed but not in PATH

Sometimes Node.js is installed but not accessible. Check these locations:
```bash
ls /usr/local/bin/node
ls /opt/homebrew/bin/node
which -a node
```

If you find it, you can create a symlink or add that directory to your PATH.

## Quick Test

After installation, test with:
```bash
node --version
npm --version
```

You should see version numbers like:
```
v20.x.x
10.x.x
```

Once you see version numbers, you're ready to continue with the setup!
