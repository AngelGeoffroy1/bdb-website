const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Gestion des CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
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

        console.log(`📋 Récupération du profil pour: ${user.email}`);

        // Récupérer le profil complet depuis la table users
        const { data: userProfile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('Erreur lors de la récupération du profil:', profileError);
            
            // Si le profil n'existe pas, retourner les données de base de l'auth
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        first_name: user.user_metadata?.first_name || '',
                        last_name: user.user_metadata?.last_name || '',
                        phone: user.user_metadata?.phone || null,
                        email_confirmed: user.email_confirmed_at ? true : false,
                        created_at: user.created_at,
                        last_sign_in: user.last_sign_in_at
                    }
                })
            };
        }

        // Combiner les données auth et profil
        const completeUserProfile = {
            id: user.id,
            email: user.email,
            first_name: userProfile.first_name || user.user_metadata?.first_name || '',
            last_name: userProfile.last_name || user.user_metadata?.last_name || '',
            phone: userProfile.phone || user.user_metadata?.phone || null,
            date_of_birth: userProfile.date_of_birth,
            school: userProfile.school,
            study_year: userProfile.study_year,
            city: userProfile.city,
            is_admin: userProfile.is_admin || false,
            email_confirmed: user.email_confirmed_at ? true : false,
            created_at: userProfile.created_at || user.created_at,
            updated_at: userProfile.updated_at,
            last_sign_in: user.last_sign_in_at
        };

        console.log(`✅ Profil récupéré avec succès pour: ${user.email}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                user: completeUserProfile
            })
        };

    } catch (error) {
        console.error('Erreur serveur lors de la récupération du profil:', error);
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
