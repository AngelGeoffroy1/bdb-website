const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('📧 Fonction sendTicketEmail appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    // Gestion des requêtes OPTIONS pour CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    try {
        const { sessionId, customerEmail, eventId } = JSON.parse(event.body);

        if (!sessionId || !customerEmail || !eventId) {
            console.log('❌ Paramètres manquants');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Paramètres manquants' })
            };
        }

        console.log('📝 Envoi email pour:', { sessionId, customerEmail, eventId });

        // Récupérer les détails de l'événement
        const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select(`
                id, name, description, date, location, price, image_url,
                associations (name, profile_image_url)
            `)
            .eq('id', eventId)
            .single();

        if (eventError || !eventData) {
            console.error('❌ Erreur récupération événement:', eventError);
            throw new Error('Événement non trouvé');
        }

        // Récupérer les tickets créés
        const { data: ticketsData, error: ticketsError } = await supabase
            .from('tickets')
            .select('ticket_code, quantity, total_amount, customer_first_name, customer_last_name, created_at')
            .eq('customer_email', customerEmail)
            .eq('event_id', eventId)
            .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Tickets des 5 dernières minutes
            .order('created_at', { ascending: false });

        if (ticketsError || !ticketsData || ticketsData.length === 0) {
            console.error('❌ Erreur récupération tickets:', ticketsError);
            throw new Error('Tickets non trouvés');
        }

        console.log('✅ Tickets trouvés:', ticketsData.length);

        // Configuration du transporteur SMTP OVH
        const transporter = nodemailer.createTransport({
            host: 'ssl0.ovh.net',
            port: 587,
            secure: false, // TLS
            auth: {
                user: process.env.EMAIL_USER,     // contactus@bdbapp.fr
                pass: process.env.EMAIL_PASSWORD  // Votre mot de passe OVH
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Générer le template HTML de l'email
        const emailHtml = generateEmailTemplate(eventData, ticketsData, customerEmail);

        // Envoyer l'email
        const mailOptions = {
            from: `"BDB - Le Bureau des Bureaux" <${process.env.EMAIL_USER}>`,
            to: customerEmail,
            subject: `🎫 Votre ticket pour ${eventData.name} - BDB`,
            html: emailHtml,
            text: generateEmailText(eventData, ticketsData, customerEmail)
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Email envoyé avec succès:', result.messageId);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                messageId: result.messageId,
                message: 'Email envoyé avec succès'
            })
        };

    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi de l\'email:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
                error: 'Erreur lors de l\'envoi de l\'email',
                details: error.message
            })
        };
    }
};

// Fonction pour générer le template HTML de l'email
function generateEmailTemplate(eventData, ticketsData, customerEmail) {
    const eventDate = new Date(eventData.date);
    const formattedDate = eventDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const totalAmount = ticketsData.reduce((sum, ticket) => sum + parseFloat(ticket.total_amount), 0);
    const customerName = ticketsData[0] ? `${ticketsData[0].customer_first_name} ${ticketsData[0].customer_last_name}` : 'Client';

    // Générer les QR codes
    const qrCodesHtml = ticketsData.map((ticket, index) => {
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticket.ticket_code)}`;
        return `
            <div style="text-align: center; margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <h3 style="color: #DAFC3B; margin-bottom: 15px;">Ticket ${index + 1}</h3>
                <img src="${qrCodeUrl}" alt="QR Code Ticket ${index + 1}" style="max-width: 200px; height: 200px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                <p style="margin-top: 10px; font-family: monospace; color: #666; font-size: 12px; word-break: break-all;">${ticket.ticket_code}</p>
            </div>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Votre ticket BDB</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #050505;
                }
                .container {
                    background: white;
                    border-radius: 15px;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                }
                .header {
                    background: linear-gradient(135deg, #DAFC3B, #B8E026);
                    padding: 30px;
                    text-align: center;
                    color: #050505;
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .content {
                    padding: 30px;
                }
                .event-info {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 20px 0;
                    border-left: 4px solid #DAFC3B;
                }
                .customer-info {
                    background: #e8f4fd;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 20px 0;
                }
                .qr-section {
                    text-align: center;
                    margin: 30px 0;
                }
                .footer {
                    background: #050505;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    font-size: 14px;
                }
                .price {
                    font-size: 24px;
                    font-weight: bold;
                    color: #DAFC3B;
                }
                .btn {
                    display: inline-block;
                    padding: 12px 24px;
                    background: #DAFC3B;
                    color: #050505;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    margin: 10px 0;
                }
                @media (max-width: 600px) {
                    body { padding: 10px; }
                    .content { padding: 20px; }
                    .header { padding: 20px; }
                }
            </style>
        </head>
        <body style="background-color: #050505;">
            <div class="container">
                <div class="header">
                    <div class="logo">🎫 BDB</div>
                    <h1>Votre ticket est prêt !</h1>
                    <p>Merci pour votre achat sur BDB - Le Bureau des Bureaux</p>
                </div>
                
                <div class="content">
                    <div class="customer-info">
                        <h2>👤 Informations client</h2>
                        <p><strong>Nom :</strong> ${customerName}</p>
                        <p><strong>Email :</strong> ${customerEmail}</p>
                        <p><strong>Date d'achat :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
                    </div>

                    <div class="event-info">
                        <h2>🎉 Détails de l'événement</h2>
                        <p><strong>Événement :</strong> ${eventData.name}</p>
                        <p><strong>Date :</strong> ${formattedDate}</p>
                        <p><strong>Lieu :</strong> ${eventData.location}</p>
                        <p><strong>Organisateur :</strong> ${eventData.associations?.name || 'BDB'}</p>
                        <p><strong>Nombre de tickets :</strong> ${ticketsData.length}</p>
                        <p><strong>Prix total :</strong> <span class="price">${totalAmount.toFixed(2)}€</span></p>
                    </div>

                    <div class="qr-section">
                        <h2>📱 Vos QR Codes</h2>
                        <p>Présentez ces QR codes à l'entrée de l'événement :</p>
                        ${qrCodesHtml}
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://bureaudesbureaux.com" class="btn">Visiter notre site</a>
                    </div>
                </div>

                <div class="footer">
                    <p><strong>BDB - Le Bureau des Bureaux</strong></p>
                    <p>contactus@bdbapp.fr</p>
                    <p>Bordeaux, France</p>
                    <p style="margin-top: 15px; font-size: 12px; opacity: 0.8;">
                        Cet email a été envoyé automatiquement suite à votre achat. 
                        Gardez précieusement vos QR codes pour l'entrée à l'événement.
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Fonction pour générer la version texte de l'email
function generateEmailText(eventData, ticketsData, customerEmail) {
    const eventDate = new Date(eventData.date);
    const formattedDate = eventDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const totalAmount = ticketsData.reduce((sum, ticket) => sum + parseFloat(ticket.total_amount), 0);
    const customerName = ticketsData[0] ? `${ticketsData[0].customer_first_name} ${ticketsData[0].customer_last_name}` : 'Client';

    return `
VOTRE TICKET BDB EST PRÊT !

Bonjour ${customerName},

Merci pour votre achat sur BDB - Le Bureau des Bureaux !

DÉTAILS DE L'ÉVÉNEMENT :
- Événement : ${eventData.name}
- Date : ${formattedDate}
- Lieu : ${eventData.location}
- Organisateur : ${eventData.associations?.name || 'BDB'}
- Nombre de tickets : ${ticketsData.length}
- Prix total : ${totalAmount.toFixed(2)}€

VOS CODES DE TICKETS :
${ticketsData.map((ticket, index) => `Ticket ${index + 1}: ${ticket.ticket_code}`).join('\n')}

IMPORTANT : 
- Présentez ces codes à l'entrée de l'événement
- Gardez cet email précieusement
- En cas de problème, contactez-nous à contactus@bdbapp.fr

BDB - Le Bureau des Bureaux
Bordeaux, France
contactus@bdbapp.fr

---
Cet email a été envoyé automatiquement suite à votre achat.
    `.trim();
}
