import datetime
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12

print("Generating RSA key...")
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
)

print("Generating Certificate...")
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"Ivan Lindgren"),
    x509.NameAttribute(NameOID.COMMON_NAME, u"Citavuk Release"),
])

cert = x509.CertificateBuilder().subject_name(
    subject
).issuer_name(
    issuer
).public_key(
    private_key.public_key()
).serial_number(
    x509.random_serial_number()
).not_valid_before(
    datetime.datetime.now(datetime.timezone.utc)
).not_valid_after(
    datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=10000)
).add_extension(
    x509.BasicConstraints(ca=True, path_length=None), critical=True,
).sign(private_key, hashes.SHA256())

print("Serializing to PKCS12...")
p12 = pkcs12.serialize_key_and_certificates(
    b"citavuk_release_alias", # name (alias)
    private_key,
    cert,
    None,
    serialization.BestAvailableEncryption(b"citavuk123") # password
)

with open("upload-keystore.p12", "wb") as f:
    f.write(p12)

import base64
encoded = base64.b64encode(p12).decode('utf-8')
with open("upload-keystore-base64.txt", "w") as f:
    f.write(encoded)

print("Done! Keystore saved to upload-keystore.p12 and base64 string to upload-keystore-base64.txt")
