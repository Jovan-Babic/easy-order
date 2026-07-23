# Easy Order App - Setup Instructions

## Prerequisites
- MongoDB must be running locally (`mongod` on localhost:27017)
- Node.js/npm installed (for frontend)
- Python installed (for backend)

## Step 1: Start Backend
```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

## Step 2: Get Your Machine's Local IP
```powershell
# Run this in PowerShell:
ipconfig
# Look for "IPv4 Address" under "Ethernet adapter" or "Wireless LAN adapter"
```

## Step 3: Update Frontend .env
Edit `frontend/.env` and replace `192.168.1.X` with your actual IP:
```
EXPO_PUBLIC_BACKEND_URL=http://YOUR_ACTUAL_IP:8000
```

## Step 4: Start Frontend
```powershell
cd frontend
npm start
```
Then scan the QR code with Expo Go app on your phone.

## Troubleshooting Connection
- Ensure backend is accessible: `curl http://YOUR_IP:8000/docs`
- Phone and computer must be on same network
- Firewall may block port 8000 - allow it through
