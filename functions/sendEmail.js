const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    const { name, email, message } = JSON.parse(event.body);

    if (!name || !email || !message) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                success: false,
                message: 'Tous les champs sont requis.'
            })
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
        from: `"Formulaire BDB" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        replyTo: email,
        subject: `[Contact BDB] Nouveau message de ${name}`,
        text: `Nouveau message reçu via le formulaire de contact BDB :

De : ${name}
Email : ${email}

Message :
${message}

---
Cet email a été envoyé via le formulaire de contact du site BDB.`,
        html: `
            <h2>Nouveau message reçu via le formulaire de contact BDB</h2>
            <p><strong>De :</strong> ${name}</p>
            <p><strong>Email :</strong> ${email}</p>
            <br>
            <p><strong>Message :</strong></p>
            <p style="white-space: pre-wrap;">${message}</p>
            <br>
            <hr>
            <p style="color: #666; font-size: 0.9em;">Cet email a été envoyé via le formulaire de contact du site BDB.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Votre message a été envoyé avec succès ! Nous vous répondrons dans les plus brefs délais.'
            })
        };
    } catch (error) {
        console.error('Erreur d\'envoi:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                message: 'Une erreur est survenue lors de l\'envoi du message. Veuillez réessayer plus tard.'
            })
        };
    }
}; 