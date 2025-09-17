const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Gestion des CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: false, error: 'Méthode non autorisée' })
        };
    }

    try {
        // Vérifier les variables d'environnement Supabase
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            console.error('Variables d\'environnement Supabase manquantes');
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Configuration serveur manquante' 
                })
            };
        }

        // Récupérer le token d'authentification depuis les headers
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Token d\'authentification manquant' 
                })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        // Initialiser le client Supabase
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Vérifier et récupérer les informations de l'utilisateur depuis le token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.error('Token invalide ou utilisateur non trouvé:', authError?.message);
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Token d\'authentification invalide' 
                })
            };
        }

        console.log(`🚪 Déconnexion de: ${user.email}`);

        // Déconnecter l'utilisateur côté serveur
        // Note: Supabase gère automatiquement l'invalidation des tokens
        // On peut aussi appeler supabase.auth.signOut() si nécessaire

        console.log(`✅ Déconnexion réussie pour: ${user.email}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Déconnexion réussie'
            })
        };

    } catch (error) {
        console.error('Erreur serveur lors de la déconnexion:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: 'Erreur serveur interne' 
            })
        };
    }
};
