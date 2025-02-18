const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    const { name, email, message } = JSON.parse(event.body);

    if (!name || !email || !message) {
        return {
            statusCode: 400,
            body: 'Tous les champs sont requis.'
        };
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS
        }
    });

    const mailOptions = {
        from: email,
        to: 'bob@bobsarl.com',
        subject: `Nouveau message de ${name}`,
        text: message
    };

    try {
        await transporter.sendMail(mailOptions);
        return {
            statusCode: 200,
            body: 'Email envoyé avec succès'
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: 'Erreur lors de l\'envoi de l\'email'
        };
    }
}; 