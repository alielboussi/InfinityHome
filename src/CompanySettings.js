/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import db from './dataClient';
import BackToDashboard from './BackToDashboard';
// Removed user permissions imports

const CompanySettings = () => {
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyTPIN, setCompanyTPIN] = useState('');
  const [companyLogo, setCompanyLogo] = useState(null); // Store uploaded logo
  const [companyId, setCompanyId] = useState(null); // To store the current company ID
  // Removed user permissions state

  // Fetch company data when the component mounts
  useEffect(() => {
    const fetchCompanyData = async () => {
      try {
        const { data, error } = await db
          .from('company_settings')
          .select('*')
          .single(); // Assuming you want to fetch the only one company record

        if (error) throw error;

        // Populate the fields with the company data
        setCompanyId(data.id);
        setCompanyName(data.company_name);
        setCompanyAddress(data.company_address);
        setCompanyPhone(data.company_phone);
        setCompanyEmail(data.company_email);
        setCompanyTPIN(data.company_tpin);
        setCompanyLogo(data.company_logo); // Display existing logo if any
      } catch (error) {
        console.error('Error fetching company data:', error);
        alert('An error occurred while fetching the company data.');
      }
    };

    fetchCompanyData();
  }, []);

  // Removed permissions fetching logic

  // Removed permission helpers
  const canEdit = true;

  // Handle the logo upload
  const handleLogoUpload = async (file) => {
    try {
      const bucketName = 'companylogos';
      const filePath = `companylogos/${file.name}`;
      console.log('Uploading to bucket:', bucketName);
      console.log('File object:', file);
      console.log('File path:', filePath);

      const { data, error } = await db.storage
        .from(bucketName) // Use variable for bucket name
        .upload(filePath, file);

      if (error) {
        console.error('Logo upload error:', error);
        alert('An error occurred while uploading the logo: ' + error.message + '\n\nFull error: ' + JSON.stringify(error));
        return null;
      }

      const { data: publicData } = db.storage.from(bucketName).getPublicUrl(filePath);
      return publicData?.publicUrl || '';
    } catch (error) {
      console.error('Unexpected error uploading logo:', error);
      alert('An unexpected error occurred while uploading the logo.\n\n' + error.toString());
      return null;
    }
  };

  // Handle save and update company settings
  const handleSaveSettings = async () => {
    try {
      let logoUrl = companyLogo;

      // If a new logo is uploaded, upload it first
      if (companyLogo instanceof File) {
        // Call the handleLogoUpload function and get the URL
        logoUrl = await handleLogoUpload(companyLogo);
        if (!logoUrl) {
          alert('Logo upload failed. Please try again.');
          return;
        }
      }

      // After logo upload is successful, save other settings
      const { error } = await db
        .from('company_settings')
        .upsert({
          id: companyId, // Update the existing company record
          company_name: companyName,
          company_address: companyAddress,
          company_phone: companyPhone,
          company_email: companyEmail,
          company_tpin: companyTPIN,
          company_logo: logoUrl, // Save the uploaded logo URL
        });

      if (error) throw error;

      alert('Company settings updated successfully!');
    } catch (error) {
      console.error('An error occurred while saving settings:', error);
      alert('An unexpected error occurred.');
    }
  };

  // Removed permission access check

  return (
    <div className="company-settings-page-container">
      <div className="page-header-row">
        <BackToDashboard />
        <h1 style={{ margin: 0 }}>Company Settings</h1>
      </div>

      <div className="company-settings-form">
        {/* Form Fields */}
        <div className="form-group">
          <label>Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Enter company name"
          />
        </div>

        <div className="form-group">
          <label>Company Address</label>
          <input
            type="text"
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            placeholder="Enter company address"
          />
        </div>

        <div className="form-group">
          <label>Company Phone</label>
          <input
            type="text"
            value={companyPhone}
            onChange={(e) => setCompanyPhone(e.target.value)}
            placeholder="Enter company phone"
          />
        </div>

        <div className="form-group">
          <label>Company Email</label>
          <input
            type="email"
            value={companyEmail}
            onChange={(e) => setCompanyEmail(e.target.value)}
            placeholder="Enter company email"
          />
        </div>

        <div className="form-group">
          <label>Company TPIN</label>
          <input
            type="text"
            value={companyTPIN}
            onChange={(e) => setCompanyTPIN(e.target.value)}
            placeholder="Enter company TPIN"
          />
        </div>

        <div className="form-group">
          <label>Company Logo</label>
          <input
            type="file"
            onChange={(e) => setCompanyLogo(e.target.files[0])}
          />
        </div>

        {/* Button container for Save */}
        <div className="button-container">
          {canEdit && (
            <button onClick={handleSaveSettings}>
              {companyId ? 'Update Settings' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanySettings;
