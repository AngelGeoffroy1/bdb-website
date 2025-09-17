const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    console.log('🧪 Fonction testEmail appelée');

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
        const { testEmail, eventId } = JSON.parse(event.body);

        if (!testEmail) {
            console.log('❌ Email de test manquant');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Email de test requis' })
            };
        }

        console.log('📧 Test d\'envoi email vers:', testEmail);

        // Récupérer un événement existant ou créer des données de test
        let eventData;
        if (eventId) {
            const { data, error } = await supabase
                .from('events')
                .select(`
                    id, name, description, date, location, price, image_url,
                    associations (name, profile_image_url)
                `)
                .eq('id', eventId)
                .single();

            if (error || !data) {
                console.log('⚠️ Événement non trouvé, utilisation de données de test');
                eventData = createTestEventData();
            } else {
                eventData = data;
            }
        } else {
            eventData = createTestEventData();
        }

        // Créer des tickets de test
        const ticketsData = createTestTicketsData();

        // Configuration du transporteur SMTP OVH
        const transporter = nodemailer.createTransport({
            host: 'ssl0.ovh.net',
            port: 587,
            secure: false, // TLS
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Générer le template HTML de l'email
        const emailHtml = generateEmailTemplate(eventData, ticketsData, testEmail);

        // Envoyer l'email de test
        const mailOptions = {
            from: `"BDB - Le Bureau des Bureaux" <${process.env.EMAIL_USER}>`,
            to: testEmail,
            subject: `🧪 [TEST] Votre ticket pour ${eventData.name} - BDB`,
            html: emailHtml,
            text: generateEmailText(eventData, ticketsData, testEmail)
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Email de test envoyé avec succès:', result.messageId);

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
                message: 'Email de test envoyé avec succès',
                eventUsed: eventData.name,
                ticketsCount: ticketsData.length
            })
        };

    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi de l\'email de test:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
                error: 'Erreur lors de l\'envoi de l\'email de test',
                details: error.message
            })
        };
    }
};

// Fonction pour créer des données d'événement de test
function createTestEventData() {
    return {
        id: 'test-event-id',
        name: 'Test Event - Soirée Étudiante',
        description: 'Un événement de test pour valider le système d\'email de BDB. Venez découvrir l\'ambiance étudiante de Bordeaux !',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Dans 7 jours
        location: 'Bar des Étudiants, 33000 Bordeaux',
        price: 5.00,
        image_url: 'Asset/EventPhare 01.png',
        associations: {
            name: 'Association Test BDB'
        }
    };
}

// Fonction pour créer des tickets de test
function createTestTicketsData() {
    return [
        {
            ticket_code: 'test-ticket-001-' + Math.random().toString(36).substr(2, 9),
            quantity: 1,
            total_amount: 5.00,
            customer_first_name: 'Test',
            customer_last_name: 'Client',
            created_at: new Date().toISOString()
        },
        {
            ticket_code: 'test-ticket-002-' + Math.random().toString(36).substr(2, 9),
            quantity: 1,
            total_amount: 5.00,
            customer_first_name: 'Test',
            customer_last_name: 'Client',
            created_at: new Date().toISOString()
        }
    ];
}

// Fonction pour générer le template HTML de l'email (reprise de sendTicketEmail.js)
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
    const customerName = ticketsData[0] ? `${ticketsData[0].customer_first_name} ${ticketsData[0].customer_last_name}` : 'Test Client';

    // Générer les QR codes
    const qrCodesHtml = ticketsData.map((ticket, index) => {
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticket.ticket_code)}`;
        return `
            <div style="text-align: center; margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <h3 style="color: #DAFC3B; margin-bottom: 15px;">Ticket ${index + 1} [TEST]</h3>
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
            <title>Votre ticket BDB [TEST]</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f4f4f4;
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
                .test-banner {
                    background: #ff6b6b;
                    color: white;
                    padding: 10px;
                    text-align: center;
                    font-weight: bold;
                    font-size: 14px;
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
        <body>
            <div class="container">
                <div class="test-banner">
                    🧪 EMAIL DE TEST - Ceci est un email de test du système BDB
                </div>
                
                <div class="header">
                    <div class="logo">🎫 BDB</div>
                    <h1>Votre ticket est prêt ! [TEST]</h1>
                    <p>Merci pour votre achat sur BDB - Le Bureau des Bureaux</p>
                </div>
                
                <div class="content">
                    <div class="customer-info">
                        <h2>👤 Informations client</h2>
                        <p><strong>Nom :</strong> ${customerName}</p>
                        <p><strong>Email :</strong> ${customerEmail}</p>
                        <p><strong>Date d'achat :</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
                        <p><strong>Type :</strong> <span style="color: #ff6b6b; font-weight: bold;">EMAIL DE TEST</span></p>
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
                        <h2>📱 Vos QR Codes [TEST]</h2>
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
                        🧪 Cet email de test a été envoyé pour valider le système d'email BDB. 
                        Les QR codes sont fonctionnels mais ne correspondent pas à de vrais tickets.
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
    const customerName = ticketsData[0] ? `${ticketsData[0].customer_first_name} ${ticketsData[0].customer_last_name}` : 'Test Client';

    return `
🧪 EMAIL DE TEST - BDB SYSTÈME DE TICKETS

Bonjour ${customerName},

Ceci est un email de test du système d'email BDB !

DÉTAILS DE L'ÉVÉNEMENT [TEST] :
- Événement : ${eventData.name}
- Date : ${formattedDate}
- Lieu : ${eventData.location}
- Organisateur : ${eventData.associations?.name || 'BDB'}
- Nombre de tickets : ${ticketsData.length}
- Prix total : ${totalAmount.toFixed(2)}€

VOS CODES DE TICKETS [TEST] :
${ticketsData.map((ticket, index) => `Ticket ${index + 1}: ${ticket.ticket_code}`).join('\n')}

IMPORTANT : 
🧪 Ceci est un email de test - les tickets ne sont pas valides
- Les QR codes sont fonctionnels mais ne correspondent pas à de vrais événements
- Utilisez cette fonction pour tester le système d'email

BDB - Le Bureau des Bureaux
Bordeaux, France
contactus@bdbapp.fr

---
Cet email de test a été envoyé pour valider le système d'email BDB.
    `.trim();
}
