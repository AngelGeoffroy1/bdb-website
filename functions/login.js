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

        // Initialiser le client Supabase
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Parser les données de la requête
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Email et mot de passe requis' 
                })
            };
        }

        console.log(`🔐 Tentative de connexion pour: ${email}`);

        // Authentifier l'utilisateur avec Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password
        });

        if (authError) {
            console.error('Erreur d\'authentification:', authError.message);
            
            let errorMessage = 'Erreur de connexion';
            if (authError.message.includes('Invalid login credentials')) {
                errorMessage = 'Email ou mot de passe incorrect';
            } else if (authError.message.includes('Email not confirmed')) {
                errorMessage = 'Veuillez confirmer votre email avant de vous connecter';
            } else if (authError.message.includes('Too many requests')) {
                errorMessage = 'Trop de tentatives. Veuillez réessayer plus tard';
            }

            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: errorMessage 
                })
            };
        }

        // Récupérer le profil utilisateur depuis la table users
        const { data: userProfile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        if (profileError) {
            console.error('Erreur lors de la récupération du profil:', profileError);
            // Continuer même si le profil n'est pas trouvé
        }

        console.log(`✅ Connexion réussie pour: ${email}`);

        // Retourner les données de l'utilisateur (sans informations sensibles)
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                user: {
                    id: authData.user.id,
                    email: authData.user.email,
                    email_confirmed: authData.user.email_confirmed_at ? true : false,
                    created_at: authData.user.created_at,
                    last_sign_in: authData.user.last_sign_in_at,
                    ...userProfile
                },
                session: {
                    access_token: authData.session.access_token,
                    refresh_token: authData.session.refresh_token,
                    expires_at: authData.session.expires_at
                }
            })
        };

    } catch (error) {
        console.error('Erreur serveur lors de la connexion:', error);
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
