const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();

// Servir les fichiers statiques depuis le répertoire courant
app.use(express.static('./'));

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
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour gérer l'envoi d'email
app.post('/send-email', (req, res) => {
    const { name, email, message } = req.body;
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