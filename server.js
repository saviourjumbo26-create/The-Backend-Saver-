const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const FacebookStrategy = require('passport-facebook').Strategy;
const TikTokStrategy = require('passport-oauth2').Strategy;

const app = express();

// 1. MIDDLEWARE SETUP
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'atelier-noir-secret-key-2026', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// 2. MONGOOSE DATABASE CONNECTIVITY
mongoose.connect('mongodb://localhost:27017/fashion_voting')
    .then(() => console.log('Fashion Voter Database Savers Connected Ready.'))
    .catch(err => console.error('Database connectivity error:', err));

// 3. DATA SCHEMA DATABASE DEFINITIONS
const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true },
    password: { type: String }, // Hashed passwords
    socialId: { type: String, unique: true, sparse: true }, // For Facebook/TikTok accounts
    hasVoted: { type: Boolean, default: false },
    votedFor: { type: String }
});
const User = mongoose.model('User', UserSchema);

// 4. PASSPORT SESSION USERSHIP CONFIGS
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

// Capture Look Selection Query Middleware
const trackSelectedLook = (req, res, next) => {
    if (req.query.look) req.session.selectedLook = req.query.look;
    next();
};

// 5. SOCIAL STRATEGY SAVERS CONFIGS
passport.use(new FacebookStrategy({
    clientID: 'YOUR_FB_ID',
    clientSecret: 'YOUR_FB_SECRET',
    callbackURL: 'https://yourdomain.com/auth/facebook/callback',
    passReqToCallback: true
}, async (req, token, refreshToken, profile, done) => {
    let user = await User.findOne({ socialId: `fb_${profile.id}` });
    if (!user) {
        user = await User.create({ socialId: `fb_${profile.id}` });
    }
    return done(null, user);
}));

passport.use('tiktok', new TikTokStrategy({
    authorizationURL: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenURL: 'https://open.tiktokapis.com/v2/oauth/token/',
    clientID: 'YOUR_TIKTOK_KEY',
    clientSecret: 'YOUR_TIKTOK_SECRET',
    callbackURL: 'https://yourdomain.com/auth/tiktok/callback',
    passReqToCallback: true
}, async (req, token, refreshToken, profile, done) => {
    let user = await User.findOne({ socialId: `tt_${profile.open_id}` });
    if (!user) {
        user = await User.create({ socialId: `tt_${profile.open_id}` });
    }
    return done(null, user);
}));

// 6. ROUTE GATEWAYS FOR LOCAL AUTHENTICATION AND SIGNUP LOGIC
app.post('/auth/local-vote', async (req, res) => {
    const { email, password, chosenLook } = req.body;
    try {
        let user = await User.findOne({ email });
        
        if (!user) {
            // Automatically sign up new users with hashed credentials
            const hashedPassword = await bcrypt.hash(password, 10);
            user = await User.create({ email, password: hashedPassword });
        } else {
            // Verify structural password hash matches for returning users
            const matches = await bcrypt.compare(password, user.password);
            if (!matches) return res.send('<h2>Incorrect password provided for this account profile.</h2>');
        }

        if (user.hasVoted) return res.send('<h2>Our records show this email address has already cast a vote.</h2>');

        user.hasVoted = true;
        user.votedFor = chosenLook;
        await user.save();

        res.send('<h2>🎉 Thank you! Your style choice has been securely saved via credentials.</h2>');
    } catch (err) {
        res.status(500).send('Server Error Processing Credentials');
    }
});

// 7. SOCIAL MEDIA TRIPPERS AND REDIRECT RESPONDERS
app.get('/auth/facebook', trackSelectedLook, passport.authenticate('facebook'));
app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/' }), processSocialVote);

app.get('/auth/tiktok', trackSelectedLook, passport.authenticate('tiktok', { scope: 'user.info.basic' }));
app.get('/auth/tiktok/callback', passport.authenticate('tiktok', { failureRedirect: '/' }), processSocialVote);

async function processSocialVote(req, res) {
    const look = req.session.selectedLook;
    const user = req.user;

    if (user.hasVoted) return res.send('<h2>This social media profile has already voted in this showcase event.</h2>');

    user.hasVoted = true;
    user.votedFor = look;
    await user.save();

    req.logout(() => {
        res.send(`<h2>🎉 Thank you! Your vote for ${look.replace('_', ' ')} has been saved dynamically via social networks.</h2>`);
    });
}

app.listen(3000, () => console.log('Fashion Runway Server standing on Port 3000'));
