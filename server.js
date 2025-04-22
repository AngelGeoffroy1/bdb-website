const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const app = express();

// Servir les fichiers statiques depuis le répertoire public
app.use(express.static('./public'));

// Servir également les fichiers depuis le répertoire Asset à la racine
app.use('/Asset', express.static(path.join(__dirname, 'Asset')));

// Middleware pour analyser les requêtes POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configuration de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Route par défaut
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Route pour gérer l'envoi d'email
app.post('/send-email', (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).send('Tous les champs sont requis.');
    }

    const mailOptions = {
        from: email,
        to: 'bob@bobsarl.com',
        subject: `Nouveau message de ${name}`,
        text: message
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return res.status(500).send('Erreur lors de l\'envoi de l\'email');
        }
        res.status(200).send('Email envoyé avec succès');
    });
});

// Démarrer le serveur
const PORT = 3000;
console.log('Serveur en cours de démarrage...');

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
}); 