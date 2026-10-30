import fs from 'fs';
import path from 'path';

// Script d'injection massive de leads B2B vers l'API d'ingestion du Securium Hub
async function bulkImportLeads() {
  const csvFilePath = path.join(process.cwd(), 'data', 'prospects.csv');
  
  if (!fs.existsSync(csvFilePath)) {
    console.error("❌ Erreur : Fichier prospects.csv introuvable dans /data/");
    return;
  }

  const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
  const lines = fileContent.split('\n').filter(Boolean);
  const headers = lines[0].split(',');

  console.log(`🚀 Début de l'injection de ${lines.length - 1} leads vers le Hub...`);

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const leadData = {
      name: values[0]?.trim(),
      email: values[1]?.trim(),
      company: values[2]?.trim(),
      city: values[3]?.trim(),
      activity: values[4]?.trim(),
      siteId: 'securium-agency'
    };

    try {
      const response = await fetch('http://localhost:3000/api/outreach/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });
      const result = await response.json();
      console.log(`[Lead ${i}] Injecté avec succès :`, result);
    } catch (err) {
      console.error(`[Lead ${i}] Échec d'injection :`, err);
    }
  }
  console.log("✨ Importation massive terminée ! Vérifie ton Kanban Saworga.");
}

bulkImportLeads();