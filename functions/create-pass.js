const PassSigner = require('./pass-signing/pass-signer');

exports.handler = async (event, context) => {
    // Configuration CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/vnd.apple.pkpass'
    };

    // Gérer les requêtes OPTIONS pour CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Vérifier que la méthode est POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        // Parser le body de la requête
        let ticketData;
        try {
            ticketData = JSON.parse(event.body);
        } catch (parseError) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: 'Données JSON invalides' })
            };
        }

        // Valider les données requises
        const requiredFields = ['id', 'type', 'quantity', 'totalAmount', 'customerFirstName', 'customerLastName', 'purchaseDate'];
        const missingFields = requiredFields.filter(field => !ticketData[field]);
        
        if (missingFields.length > 0) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    error: 'Champs manquants', 
                    missingFields 
                })
            };
        }

        // Créer l'instance du signeur de pass
        const passSigner = new PassSigner();
        
        let passBuffer;
        
        // Générer le pass selon le type
        if (ticketData.type === 'event') {
            // Valider les données de l'événement
            if (!ticketData.event || !ticketData.event.name || !ticketData.event.date) {
                return {
                    statusCode: 400,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ error: 'Données d\'événement manquantes' })
                };
            }
            passBuffer = await passSigner.createEventTicketPass(ticketData);
        } else if (ticketData.type === 'nightclub') {
            // Valider les données de l'association
            if (!ticketData.association || !ticketData.association.name) {
                return {
                    statusCode: 400,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ error: 'Données d\'association manquantes' })
                };
            }
            
            // Valider les données du type de ticket
            if (!ticketData.ticketType || !ticketData.ticketType.name) {
                return {
                    statusCode: 400,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ error: 'Données du type de ticket manquantes' })
                };
            }
            passBuffer = await passSigner.createNightclubTicketPass(ticketData);
        } else {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ error: 'Type de pass non supporté. Utilisez "event" ou "nightclub"' })
            };
        }
        
        // Retourner le fichier .pkpass
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Disposition': 'attachment; filename="ticket.pkpass"',
                'Content-Length': passBuffer.length.toString()
            },
            body: passBuffer.toString('base64'),
            isBase64Encoded: true
        };

    } catch (error) {
        console.error('Erreur lors de la création du pass:', error);
        
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'Erreur lors de la création du pass',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            })
        };
    }
};
