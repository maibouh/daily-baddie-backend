const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  displayName: String,
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Profile' }],
  createdAt: { type: Date, default: Date.now }
});

// Profile Schema (for the women profiles)
const profileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  fameLevel: { type: String, enum: ['famous', 'hidden'], required: true },
  era: String,
  nationality: String,
  title: String,
  shortBio: String,
  fullStory: String,
  quote: String,
  achievements: [String],
  inspiration: String,
  modernRelevance: String,
  avatar: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Profile = mongoose.model('Profile', profileSchema);

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Routes
app.get('/', (req, res) => {
  res.json({ message: '👑 Daily Baddie API is running!' });
});

// Get all profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const { category, fameLevel } = req.query;
    let filter = {};
    
    if (category && category !== 'all') filter.category = category;
    if (fameLevel) filter.fameLevel = fameLevel;
    
    const profiles = await Profile.find(filter).sort({ createdAt: -1 });
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single profile
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User registration/login
app.post('/api/users', verifyToken, async (req, res) => {
  try {
    const { firebaseUid, email, displayName } = req.user;
    
    let user = await User.findOne({ firebaseUid });
    if (!user) {
      user = new User({
        firebaseUid,
        email,
        displayName
      });
      await user.save();
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add to favorites
app.post('/api/users/favorites/:profileId', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const profileId = req.params.profileId;
    if (!user.favorites.includes(profileId)) {
      user.favorites.push(profileId);
      await user.save();
    }
    
    res.json({ message: 'Added to favorites' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove from favorites
app.delete('/api/users/favorites/:profileId', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.favorites = user.favorites.filter(id => id.toString() !== req.params.profileId);
    await user.save();
    
    res.json({ message: 'Removed from favorites' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user favorites
app.get('/api/users/favorites', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid }).populate('favorites');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user.favorites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send push notification
app.post('/api/notifications/send', verifyToken, async (req, res) => {
  try {
    const { title, body, token } = req.body;
    
    const message = {
      notification: { title, body },
      token: token
    };
    
    const response = await admin.messaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
