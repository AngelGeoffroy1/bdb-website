const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Configuration CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Initialiser Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('❌ Variables d\'environnement Supabase manquantes');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Configuration serveur manquante' })
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parser les données
        const { email, password } = JSON.parse(event.body);

        // Validation des données
        if (!email || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Email et mot de passe requis' 
                })
            };
        }

        console.log('🔐 Tentative de connexion pour:', email);

        // Authentifier l'utilisateur
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (authError) {
            console.error('❌ Erreur auth Supabase:', authError.message);
            
            let errorMessage = 'Email ou mot de passe incorrect';
            if (authError.message.includes('Invalid login credentials')) {
                errorMessage = 'Email ou mot de passe incorrect';
            } else if (authError.message.includes('Email not confirmed')) {
                errorMessage = 'Veuillez confirmer votre email avant de vous connecter';
            } else if (authError.message.includes('Too many requests')) {
                errorMessage = 'Trop de tentatives. Veuillez réessayer plus tard';
            }

            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: errorMessage })
            };
        }

        if (!authData.user || !authData.session) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Échec de la connexion' })
            };
        }

        console.log('✅ Connexion réussie pour:', authData.user.id);

        // Récupérer les informations du profil utilisateur
        const { data: profileData, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        if (profileError) {
            console.error('❌ Erreur récupération profil:', profileError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Erreur lors de la récupération du profil' 
                })
            };
        }

        // Retourner les données utilisateur
        const userData = {
            id: authData.user.id,
            email: authData.user.email,
            first_name: profileData.first_name,
            last_name: profileData.last_name,
            phone: profileData.phone,
            date_of_birth: profileData.date_of_birth,
            school: profileData.school,
            study_year: profileData.study_year,
            city: profileData.city,
            is_admin: profileData.is_admin,
            created_at: authData.user.created_at
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Connexion réussie',
                user: userData,
                token: authData.session.access_token
            })
        };

    } catch (error) {
        console.error('❌ Erreur serveur login:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur' 
            })
        };
    }
};
