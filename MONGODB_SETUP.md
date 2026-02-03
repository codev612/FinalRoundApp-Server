# MongoDB Setup Guide

The server now uses MongoDB instead of SQLite. Follow these steps to set up MongoDB.

## 1. Install MongoDB

### Option A: Local Installation

**Windows:**
- Download MongoDB Community Server from [mongodb.com](https://www.mongodb.com/try/download/community)
- Install and start MongoDB service

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install mongodb

# Or use MongoDB's official repository
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

### Option B: MongoDB Atlas (Cloud)

1. Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get your connection string from the Atlas dashboard

## 2. Update Environment Variables

Add to your `.env` file:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=hearnow
```

For MongoDB Atlas, use:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=hearnow
```

## 3. Install Dependencies

```bash
cd server
npm install
```

This will install the `mongodb` package and remove `better-sqlite3`.

## 4. Start the Server

```bash
npm run dev
```

The server will automatically:
- Connect to MongoDB on startup
- Create the `users` collection if it doesn't exist
- Create necessary indexes (email, verification_token, reset_token)

## 5. Verify Connection

Check the console output for:
```
Connected to MongoDB
Server running on port 3000
```

## Database Schema

### Users Collection

```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  password_hash: String,
  email_verified: Boolean,
  verification_token: String (indexed),
  verification_token_expires: Number (indexed),
  reset_token: String (indexed),
  reset_token_expires: Number (indexed),
  created_at: Number (timestamp),
  updated_at: Number (timestamp)
}
```

## Migration from SQLite

If you have existing SQLite data, you'll need to migrate it manually:

1. Export data from SQLite
2. Transform the data format (IDs, timestamps, etc.)
3. Import into MongoDB

The database structure is compatible, but IDs change from integers to MongoDB ObjectIds (strings).

## Troubleshooting

### Connection Refused
- Ensure MongoDB is running: `mongosh` or check service status
- Verify `MONGODB_URI` is correct
- Check firewall settings

### Authentication Failed
- For Atlas: Verify username/password in connection string
- For local: Ensure authentication is disabled or credentials are correct

### Index Creation Errors
- These are usually safe to ignore if indexes already exist
- Check MongoDB logs for details
