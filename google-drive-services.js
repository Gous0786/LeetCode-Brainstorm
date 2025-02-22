// google-drive-services.js
class GoogleDriveService {
  constructor(token) {
      this.token = token;
      this.baseUrl = 'https://www.googleapis.com/drive/v3';
      this.uploadUrl = 'https://www.googleapis.com/upload/drive/v3';
  }

  async getOrCreateDraftsFolder() {
      try {
          const query = encodeURIComponent("name='LeetCode Drafts' and mimeType='application/vnd.google-apps.folder' and trashed=false");
          const response = await fetch(`${this.baseUrl}/files?q=${query}`, {
              headers: {
                  'Authorization': `Bearer ${this.token}`
              }
          });

          if (!response.ok) {
              console.error('Error fetching drafts folder:', response.status, response.statusText);
              throw new Error(`Failed to search for drafts folder: ${response.statusText}`);
          }

          const data = await response.json();
          if (data.files && data.files.length > 0) {
              console.log('Found existing drafts folder:', data.files[0].id);
              return data.files[0].id;
          }

          // Create new folder if it doesn't exist
          const createResponse = await fetch(`${this.baseUrl}/files`, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${this.token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  name: 'LeetCode Drafts',
                  mimeType: 'application/vnd.google-apps.folder'
              })
          });

          if (!createResponse.ok) {
              throw new Error(`Failed to create drafts folder: ${createResponse.statusText}`);
          }

          const folderData = await createResponse.json();
          console.log('Created new drafts folder:', folderData.id);
          return folderData.id;
      } catch (error) {
          console.error('Error in getOrCreateDraftsFolder:', error);
          throw error;
      }
  }

  async saveDraft(problemId, drawingData) {
      try {
          const folderId = await this.getOrCreateDraftsFolder();
          
          // Prepare the metadata for the file
          const metadata = {
              name: `drawing_${problemId}.json`,
              parents: [folderId],
              mimeType: 'application/json'
          };

          // Convert drawing data to string
          const fileContent = JSON.stringify(drawingData);

          // Create multipart body
          const boundary = 'foo_bar_baz';
          const delimiter = "\r\n--" + boundary + "\r\n";
          const closeDelimiter = "\r\n--" + boundary + "--";

          // Construct the multipart request body
          const body = delimiter +
              'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
              JSON.stringify(metadata) +
              delimiter +
              'Content-Type: application/json\r\n\r\n' +
              fileContent +
              closeDelimiter;

          // Make the upload request
          const response = await fetch(`${this.uploadUrl}/files?uploadType=multipart`, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${this.token}`,
                  'Content-Type': `multipart/related; boundary=${boundary}`,
                  'Content-Length': body.length.toString()
              },
              body: body
          });

          if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Failed to save draft: ${errorText}`);
          }

          const result = await response.json();
          console.log('Draft saved successfully:', result);
          return result;
      } catch (error) {
          console.error('Error in saveDraft:', error);
          throw error;
      }
  }

  // Update the loadDraft method to handle errors better
  async loadDraft(problemId) {
      try {
          const query = encodeURIComponent(`name='drawing_${problemId}.json' and trashed=false`);
          const response = await fetch(`${this.baseUrl}/files?q=${query}`, {
              headers: {
                  'Authorization': `Bearer ${this.token}`
              }
          });

          if (!response.ok) {
              throw new Error(`Failed to search for draft: ${response.statusText}`);
          }

          const data = await response.json();
          if (!data.files || data.files.length === 0) {
              console.log('No draft found for problem ID:', problemId);
              return null; // No file found
          }

          const fileId = data.files[0].id; // Get the file ID
          const contentResponse = await fetch(`${this.baseUrl}/files/${fileId}?alt=media`, {
              headers: {
                  'Authorization': `Bearer ${this.token}`
              }
          });

          if (!contentResponse.ok) {
              throw new Error(`Failed to load draft content: ${contentResponse.statusText}`);
          }

          const drawingData = await contentResponse.json();
          return { id: fileId, ...drawingData }; // Return both the file ID and the drawing data
      } catch (error) {
          console.error('Error in loadDraft:', error);
          throw error;
      }
  }

  async updateDraft(problemId, drawingData) {
      try {
          // First find the file
          const query = encodeURIComponent(`name='drawing_${problemId}.json' and trashed=false`);
          const response = await fetch(`${this.baseUrl}/files?q=${query}`, {
              headers: {
                  'Authorization': `Bearer ${this.token}`
              }
          });

          if (!response.ok) {
              throw new Error(`Failed to search for draft: ${response.statusText}`);
          }

          const data = await response.json();
          if (!data.files || data.files.length === 0) {
              // If file doesn't exist, create new one
              return await this.saveDraft(problemId, drawingData);
          }

          const fileId = data.files[0].id;

          // Use the upload endpoint for media content
          const updateResponse = await fetch(`${this.uploadUrl}/files/${fileId}?uploadType=media`, {
              method: 'PATCH',
              headers: {
                  'Authorization': `Bearer ${this.token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(drawingData)
          });

          if (!updateResponse.ok) {
              const errorText = await updateResponse.text();
              throw new Error(`Failed to update draft: ${errorText}`);
          }

          const result = await updateResponse.json();
          console.log('Draft updated successfully:', result);
          return result;
      } catch (error) {
          console.error('Error in updateDraft:', error);
          throw error;
      }
  }
}