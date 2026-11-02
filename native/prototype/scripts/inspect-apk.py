"""Inspect actual APK bytes without installing, signing or executing them."""
import hashlib,json,pathlib,struct,zipfile,subprocess,os
root=pathlib.Path('evidence')
meta=json.loads((root/'build-evidence.json').read_text())
asset=meta['assets'][0]; apk=root/asset['name']
raw=apk.read_bytes()
assert hashlib.sha256(raw).hexdigest()==asset['sha256']
eocd=raw.rfind(b'PK\x05\x06')
assert eocd>=0
central_offset=struct.unpack_from('<I',raw,eocd+16)[0]
assert raw[central_offset-16:central_offset]!=b'APK Sig Block 42'
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    names=z.namelist()
    assert 'AndroidManifest.xml' in names and 'classes.dex' in names
    libs=[n for n in names if n.startswith('lib/') and n.endswith('.so')]
    library=z.read('lib/arm64-v8a/libl4a_community_prototype_lib.so')
    assert library[:4]==b'\x7fELF' and library[4]==2 and struct.unpack_from('<H',library,18)[0]==183
    assert not any(n.upper().endswith(('.RSA','.DSA','.EC','.SF')) and n.startswith('META-INF/') for n in names)
    assert not any(n.endswith(('.jks','.keystore')) for n in names)
sdk=pathlib.Path(os.environ['ANDROID_HOME'])/'build-tools/37.0.0'
badging=subprocess.run([str(sdk/'aapt2'),'dump','badging',str(apk)],capture_output=True,text=True,check=True).stdout
assert "package: name='org.deomegapoint.l4acommunityprototype'" in badging
sig=subprocess.run([str(sdk/'apksigner'),'verify','--verbose',str(apk)],capture_output=True,text=True)
assert sig.returncode!=0
report={'packageSha256':asset['sha256'],'sourceCommit':meta['sourceCommit'],'zipIntegrity':True,'nativeLibrary':'ELF64 AArch64','libraries':libs,'badging':badging,'signatureVerification':sig.stdout+sig.stderr,'unsignedStructureObserved':True,'signatureVerificationPassed':False,'trustedSigningVerified':False,'installation':'NOT_ATTEMPTED_UNSIGNED_APK','deviceAcceptance':False,'offlineTested':False,'registrationTested':False}
(root/'android-inspection.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
