# Kill Process on Port 3000

If you get "address already in use" error, run:

```bash
# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

Or manually:
```bash
# Find what's using port 3000
lsof -i:3000

# Kill it (replace PID with the number from lsof output)
kill -9 <PID>
```

Then restart your server:
```bash
cd ~/inventory-app/server
NODE_ENV=development node server.js
```
