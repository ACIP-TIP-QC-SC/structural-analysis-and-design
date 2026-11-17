#!/usr/bin/env python3
"""Independent hand-checks for the Phase 2 and Phase 3 test cases in HANDOFF.md.
Units: N, mm, MPa unless a line says otherwise. Output is the expected-answer list."""
import math
sq, pi = math.sqrt, math.pi
def P(name, **kv):
    print(name + ": " + ", ".join(f"{k}={v:.5g}" if isinstance(v, float) else f"{k}={v}" for k, v in kv.items()))
def beta1(fc): return 0.85 if fc <= 28 else max(0.65, 0.85 - 0.05 * (fc - 28) / 7)
def As_req(Mu, b, d, fc, fy, phi=0.9):
    Rn = Mu / (phi * b * d * d)
    rho = 0.85 * fc / fy * (1 - sq(1 - 2 * Rn / (0.85 * fc)))
    return rho * b * d

# ---------------- TW: two-way slabs
ln = 5600.0
P("TW-1a flat plate fy420", ext_no_edge=ln/30, ext_edge=ln/33, interior=ln/33)
P("TW-1b beams afm1.2 beta1.25", h=ln*(0.8+420/1400)/(36+5*1.25*(1.2-0.2)))
P("TW-1c beams afm2.5 beta1.25", h=ln*(0.8+420/1400)/(36+9*1.25))
qu = 1.2*6.0 + 1.6*3.0; l1, l2, c = 6.0, 5.0, 0.5; lnn = l1 - c
Mo = qu*l2*lnn**2/8
P("TW-2 static", qu=qu, ln=lnn, Mo=Mo)
P("TW-2 interior span", neg=0.65*Mo, pos=0.35*Mo, cs_neg=0.75*0.65*Mo, cs_pos=0.60*0.35*Mo, ms_neg=0.25*0.65*Mo, ms_pos=0.40*0.35*Mo)
P("TW-2 end span no edge beam", ext_neg=0.26*Mo, pos=0.52*Mo, int_neg=0.70*Mo, cs_ext_neg=0.26*Mo, cs_pos=0.6*0.52*Mo, cs_int_neg=0.75*0.70*Mo)
b, d, fc, fy, h = 2500.0, 160.0, 28.0, 420.0, 200.0
As = As_req(0.75*0.65*Mo*1e6, b, d, fc, fy)
P("TW-2 col strip interior negative steel", Mu=0.75*0.65*Mo, As=As, As_min=0.0018*b*h, s_max=min(2*h, 450))
d = 160.0; cc = 500.0; b1 = cc + d; bo = 4*b1
Vu = qu*(l1*l2 - (b1/1000)**2)*1000
vc = min(0.33*sq(fc), 0.17*(1+2/1.0)*sq(fc), 0.083*(2+40*d/bo)*sq(fc))
vu = Vu/(bo*d)
Jc = d*b1**3/6 + b1*d**3/6 + d*b1*b1**2/2
gf = 1/(1+2/3*sq(1.0)); gv = 1-gf
vmax = vu + gv*40e6*(b1/2)/Jc
P("TW-3 punching", Vu_kN=Vu/1000, bo=bo, vc=vc, phi_vc=0.75*vc, vu=vu, DC=vu/(0.75*vc), gamma_f=gf, gamma_v=gv, Jc=Jc, vu_max_with_M40=vmax, DC_M=vmax/(0.75*vc))

# ---------------- COL: columns
fc, fy, Es = 28.0, 420.0, 200000.0
Ag = 400.0*400; Ast = 8*pi*25**2/4
Po = 0.85*fc*(Ag-Ast) + fy*Ast
P("COL-1 tied 400x400 8-25", Ast=Ast, rho_g=Ast/Ag, Po_kN=Po/1e3, Pn_max_kN=0.8*Po/1e3, phiPn_max_kN=0.65*0.8*Po/1e3, WSD_allow_kN=0.4*0.8*Po/1e3)
Pu = 3000e3; rho = 0.02
Agreq = Pu/(0.65*0.8*(0.85*fc*(1-rho)+fy*rho))
P("COL-1b design Pu3000 rho0.02", Ag_req=Agreq, side=sq(Agreq), Ast_at_450=None or (Pu/(0.65*0.8)-0.85*fc*450*450)/(fy-0.85*fc))
D = 500.0; Agc = pi*D*D/4; Dch = D-2*40; Ach = pi*Dch**2/4; dsp = 10.0; asp = pi*dsp**2/4
Po2 = 0.85*fc*(Agc-Ast)+fy*Ast
rs = 0.45*(Agc/Ach-1)*fc/420
s = 4*asp*(Dch-dsp)/(Dch**2*rs)
P("COL-2 spiral D500 8-25", Ag=Agc, Ach=Ach, Po_kN=Po2/1e3, phiPn_max_kN=0.75*0.85*Po2/1e3, rho_s_min=rs, pitch_max=s, clear=s-dsp)
P("COL-2b ties for 25 bars 10 ties 400 col", s=min(16*25, 48*10, 400))
# interaction 400x400, layers
bcol, hcol = 400.0, 400.0
layers = [(62.5, 3*pi*25**2/4), (200.0, 2*pi*25**2/4), (337.5, 3*pi*25**2/4)]
ety = fy/Es; b1_ = beta1(fc); dt = 337.5
def PM(c):
    a = min(b1_*c, hcol)
    Pn = 0.85*fc*a*bcol; Mn = 0.85*fc*a*bcol*(hcol/2-a/2)
    for di, Asi in layers:
        es = 0.003*(c-di)/c; fs = max(-fy, min(fy, Es*es))
        F = Asi*(fs - (0.85*fc if di < a and fs > 0 else 0))
        Pn += F; Mn += F*(hcol/2-di)
    et = 0.003*(dt-c)/c
    phi = 0.65 if et <= ety else (0.9 if et >= 0.005 else 0.65+0.25*(et-ety)/(0.005-ety))
    return Pn, Mn, et, phi
for nm, c in (("balanced", 0.003/(0.003+ety)*dt), ("et=0.005", 0.375*dt), ("c=300", 300.0)):
    Pn, Mn, et, phi = PM(c)
    P("COL-3 "+nm, c=c, Pn_kN=Pn/1e3, Mn_kNm=Mn/1e6, et=et, phi=phi, phiPn=phi*Pn/1e3, phiMn=phi*Mn/1e6)
lo, hi = 20.0, 200.0
for _ in range(80):
    mid = (lo+hi)/2
    if PM(mid)[0] > 0: hi = mid
    else: lo = mid
Pn, Mn, et, phi = PM(hi); P("COL-3 pure bending", c=hi, Mn_kNm=Mn/1e6, phi=phi, phiMn=phi*Mn/1e6)
P("COL-3 pure tension", Pn_kN=-fy*Ast/1e3, phiPn=-0.9*fy*Ast/1e3)
e = 150.0; lo, hi = 60.0, 2000.0
for _ in range(100):
    mid = (lo+hi)/2; Pn, Mn, _, _ = PM(mid)
    if Pn <= 0 or Mn/Pn > e: lo = mid
    else: hi = mid
Pn, Mn, et, phi = PM(hi)
cap = min(phi*Pn, 0.65*0.8*Po)
P("COL-3 at e=150 (Pu1500, Mu225)", c=hi, Pn_kN=Pn/1e3, Mn_kNm=Mn/1e6, et=et, phi=phi, phiPn_kN=cap/1e3, phiMn_kNm=cap*e/1e6, DC=1500e3/cap)
Ec = 4700*sq(fc); Ig = 400.0**4/12; lu = 6000.0; r = 0.3*400
EI = 0.4*Ec*Ig/(1+0.6); Pc = pi**2*EI/lu**2; Cm = 0.6-0.4*(-0.5)
Puu = 1500e3; delta = max(1.0, Cm/(1-Puu/(0.75*Pc)))
P("COL-5 slender, too slender (Pu 1500)", delta=delta, Mc_kNm=delta*120, exceeds_1p4=delta > 1.4)
Puu = 1000e3; delta = max(1.0, Cm/(1-Puu/(0.75*Pc)))
P("COL-4 slender nonsway (Pu 1000)", klu_r=lu/r, limit=min(34+12*(-0.5), 40), Ec=Ec, EI=EI, Pc_kN=Pc/1e3, Cm=Cm, M2min_kNm=Puu*(15+0.03*400)/1e6, delta=delta, Mc_kNm=delta*120, ratio_limit_1p4=delta<=1.4)

# ---------------- DEV
rt = sq(28.0)
P("DEV-1 tension", d25_simplified=420/(1.7*rt)*25, d25_other=420/(1.1*rt)*25, d25_general_cb50=420/(1.1*rt)*(1/2.0)*25, d16_top_simplified=420*1.3/(2.1*rt)*16, d16_general_cb40_psis0p8=max(300, 420/(1.1*rt)*(1.3*0.8/2.5)*16))
P("DEV-2 hook 20mm", ldh=0.24*420/rt*20, with_psic=0.7*0.24*420/rt*20, min8db=160, min150=150)
P("DEV-3 compression 25mm", a=0.24*420/rt*25, b=0.043*420*25)
P("DEV-4 laps", classB_25=1.3*420/(1.7*rt)*25, classA_25=420/(1.7*rt)*25, comp_25_fy420=0.071*420*25, comp_25_fy520=(0.13*520-24)*25, comp_25_fc17=0.071*420*25*4/3)

# ---------------- SV
b, h, d, As, fc, L = 300.0, 500.0, 440.0, 3*pi*25**2/4, 28.0, 6000.0
Ec = 4700*sq(fc); n = 200000/Ec
kd = (-n*As + sq((n*As)**2 + 2*b*n*As*d))/b
Icr = b*kd**3/3 + n*As*(d-kd)**2; Ig = b*h**3/12; fr = 0.62*sq(fc); Mcr = fr*Ig/(h/2)
def Ie(Ma): return min(Ig, (Mcr/Ma)**3*Ig + (1-(Mcr/Ma)**3)*Icr)
MaD = 15*6**2/8*1e6; MaDL = 25*6**2/8*1e6
dD = 5*MaD*L**2/(48*Ec*Ie(MaD)); dDL = 5*MaDL*L**2/(48*Ec*Ie(MaDL)); dL = dDL-dD
lam = 2.0/(1+50*0)
dlt = lam*(dD+0.3*dL); tot = dlt+dL
P("SV-1 deflection", n=n, kd=kd, Icr=Icr, Ig=Ig, fr=fr, Mcr_kNm=Mcr/1e6, Ie_D=Ie(MaD), Ie_DL=Ie(MaDL), dD=dD, dDL=dDL, dL=dL, L360=L/360, lam=lam, long_term=dlt, after_attach=tot, L240=L/240, L480=L/480)
P("SV-2 spacing", fs280_cc50=min(380*280/280-2.5*50, 300*280/280), fs250_cc40=min(380*280/250-2.5*40, 300*280/250), fs280_cc75=min(380-2.5*75, 300))

# ---------------- BC (W250x73)
E = 200000.0; Fy = 345.0
A, dd, bf, tw, tf, Ix, Zx, Sx, rx, Iy, Zy, Sy, ry, J, Cw, rts, ho = 9290, 254, 254, 8.6, 14.2, 113.21e6, 989.8e3, 894.7e3, 110, 38.88e6, 463.8e3, 306.4e3, 64.5, 578.6e3, 555.9e9, 72.1, 239.8
KL = 4000.0
Fe = pi**2*E/(KL/ry)**2; Fcr = 0.658**(Fy/Fe)*Fy if KL/ry <= 4.71*sq(E/Fy) else 0.877*Fe; Pn = Fcr*A
Lp = 1.76*ry*sq(E/Fy)
Lr = 1.95*rts*E/(0.7*Fy)*sq(J/(Sx*ho))*sq(1+sq(1+6.76*(0.7*Fy*Sx*ho/(E*J))**2))
Mp = Fy*Zx; Lb = 4000.0
lam_f = bf/(2*tf); lpf = 0.38*sq(E/Fy); lrf = 1.0*sq(E/Fy)
Mn_ltb = min(Mp, Mp-(Mp-0.7*Fy*Sx)*(Lb-Lp)/(Lr-Lp))
Mn_flb = Mp-(Mp-0.7*Fy*Sx)*(lam_f-lpf)/(lrf-lpf) if lam_f > lpf else Mp
Mnx = min(Mn_ltb, Mn_flb)
P("BC-1 strengths", KL_r=KL/ry, Fe=Fe, Fcr=Fcr, Pn_kN=Pn/1e3, Lp=Lp, Lr=Lr, Mp_kNm=Mp/1e6, lam_f=lam_f, lam_pf=lpf, Mn_ltb=Mn_ltb/1e6, Mn_flb=Mn_flb/1e6, Mnx=Mnx/1e6)
for meth, Pr, Mr, Pc, Mc in (("LRFD", 800e3, 120e6, 0.9*Pn, 0.9*Mnx), ("ASD", 530e3, 80e6, Pn/1.67, Mnx/1.67)):
    ratio = Pr/Pc
    val = ratio + 8/9*(Mr/Mc) if ratio >= 0.2 else ratio/2 + Mr/Mc
    P("BC-1 "+meth, Pc_kN=Pc/1e3, Mcx_kNm=Mc/1e6, Pr_over_Pc=ratio, eq="a" if ratio >= 0.2 else "b", interaction=val)
Pe1 = pi**2*E*Ix/4000.0**2
P("BC-2 B1", Pe1_kN=Pe1/1e3, B1_Cm1_LRFD_Pr800=1.0/(1-800e3/Pe1), B1_Cm0p4=max(1.0, 0.4/(1-800e3/Pe1)), B1_ASD_Pr530=1.0/(1-1.6*530e3/Pe1))
SPe2 = 0.85*300*4000/12
P("BC-2 B2", SPe2_kN=SPe2, B2_LRFD=1/(1-6000/SPe2), B2_ASD_SP4000=1/(1-1.6*4000/SPe2), Mr=1.0*100+1/(1-6000/SPe2)*60)

# ---------------- BT
Ab = pi*20**2/4
Rs = 372*Ab
P("BT-1 bolt shear M20 A325N", Ab=Ab, Rn_kN=Rs/1e3, LRFD=0.75*Rs/1e3, ASD=Rs/2/1e3)
be = min(1.2*(40-11)*12*400, 2.4*20*12*400); bi = min(1.2*(75-22)*12*400, 2.4*20*12*400)
P("BT-1 bearing", edge_kN=be/1e3, interior_kN=bi/1e3, sum4_kN=(2*be+2*bi)/1e3, phi_sum=0.75*(2*be+2*bi)/1e3, shear4_kN=4*Rs/1e3, phi_shear4=0.75*4*Rs/1e3, ASD_gov=4*Rs/2/1e3)
frv = 50e3/Ab; Fnt_ = min(620, 1.3*620-620/(0.75*372)*frv)
frva = 33e3/Ab; Fnt_a = min(620, 1.3*620-2.0*620/372*frva)
P("BT-2 combined", frv=frv, Fnt_mod=Fnt_, phiRn_kN=0.75*Fnt_*Ab/1e3, ASD_frv=frva, ASD_Fnt_mod=Fnt_a, ASD_Rn_over_omega=Fnt_a*Ab/2/1e3)
Rsl = 0.35*1.13*1.0*142*1
P("BT-3 slip", Rn=Rsl, serv_LRFD=Rsl, serv_ASD=Rsl/1.5, str_LRFD=0.85*Rsl, str_ASD=Rsl/1.76, ks_Tu30=1-30/(1.13*142*1), two_planes=2*Rsl)
Sd2 = 6*50**2+4*75**2; M = 150*200.0
P("BT-4 eccentric", Sd2=Sd2, M=M, direct=150/6, rx=M*75/Sd2, ry=M*50/Sd2, R=sq((M*75/Sd2)**2+(25+M*50/Sd2)**2))

# ---------------- WD
rw = 0.6*480*0.707*8
P("WD-1 fillet 8mm E70 (480)", per_mm_N=rw, Rn_300_kN=rw*300/1e3, LRFD=0.75*rw*300/1e3, ASD=rw*300/2/1e3, base_rupture_per_mm=0.6*400*10, base_yield_per_mm=0.6*248*10, min_len=4*8, transverse_factor=1.0+0.5*1.0)
Rwl = rw*300/1e3; Rwt = rw*200/1e3
P("WD-2 group", Rwl=Rwl, Rwt=Rwt, a=Rwl+Rwt, b=0.85*Rwl+1.5*Rwt, Rn=max(Rwl+Rwt, 0.85*Rwl+1.5*Rwt), LRFD=0.75*max(Rwl+Rwt, 0.85*Rwl+1.5*Rwt))
Lw = 550.0; xb = 2*150*75/Lw
Ixw = 250**3/12 + 2*150*125**2; Iyw = 2*(150**3/12+150*(75-xb)**2)+250*xb**2; Ip = Ixw+Iyw
Mw = 120*250.0; x, y = 150-xb, 125.0
fvd = 120/Lw; fx = Mw*y/Ip; fyv = Mw*x/Ip; fr_ = sq(fx**2+(fvd+fyv)**2)
P("WD-3 eccentric C weld", L=Lw, xbar=xb, Ix=Ixw, Iy=Iyw, Ip=Ip, direct=fvd, fx=fx, fy=fyv, fr_kN_per_mm=fr_, w_req_LRFD=fr_*1e3/(0.75*0.6*480*0.707), w_req_ASD_P80=fr_*80/120*1e3/(0.6*480*0.707/2))

# ---------------- CF
PA, PB = 1000.0, 1500.0; s_ = 5.0; R = PA+PB; xr = PB*s_/R; Lf = 2*(xr+0.2); Bf = R/(200*Lf)
PuA, PuB = 1.2*600+1.6*400, 1.2*900+1.6*600; Bf_use = 2.0
qu = (PuA+PuB)/(Lf*Bf_use); w = qu*Bf_use
x0 = PuA/w; Mmax = w*x0**2/2 - PuA*(x0-0.2); MB = w*5.2**2/2 - PuA*5.0
d = 0.75
Vu1 = (w*5.2-PuA) - w*(0.25+d); phiVc1 = 0.75*0.17*sq(28)*2000*750/1e3
VuB = PuB - qu*1.25**2; VuA = PuA - qu*0.775*1.15
phiv = 0.75*0.33*sq(28)
P("CF-1 rectangular", x_res=xr, L=Lf, B_req=Bf, qu=qu, w=w, V_A_left=w*0.2, V_A_right=w*0.2-PuA, x_zero=x0, M_max=Mmax, V_B_left=w*5.2-PuA, V_B_right=w*5.2-PuA-PuB, M_B=MB, Vu_oneway=Vu1, phiVc_oneway=phiVc1, Vu_punch_B=VuB, phiVc_punch_B=phiv*5000*750/1e3, Vu_punch_A=VuA, phiVc_punch_A=phiv*2700*750/1e3, As_top=As_req(abs(Mmax)*1e6, 2000, 750, 28, 420), As_min=0.0018*2000*850, As_bot_B=As_req(MB*1e6, 2000, 750, 28, 420))
Lt = 5.7; At = R/200; xbar = xr+0.2; apb = 2*At/Lt; a2b = 3*xbar*apb/Lt; bb = a2b-apb; aa = apb-bb
P("CF-2 trapezoid", area=At, xbar=xbar, a_plus_b=apb, a_at_A=aa, b_at_B=bb)
e = 1.0-0.2; R1 = 1000*6/(6-e); R2 = 2500-R1
P("CF-3 strap", e=e, R1=R1, R2=R2, A1=R1/200, B1=R1/200/2.0, A2=R2/200, side2=sq(R2/200))

# ---------------- DW
A1 = 400.0*400
P("DW-1", phiBn_col_kN=0.65*0.85*28*A1/1e3, phiBn_ftg_kN=0.65*0.85*21*A1*min(2, sq(2500**2/A1))/1e3, excess_kN=2500-0.65*0.85*28*A1/1e3, As_excess=(2500e3-0.65*0.85*28*A1)/(0.65*420), As_min=0.005*A1, ldc_ftg_16=max(0.24*420/sq(21)*16, 0.043*420*16, 200), ldc_col_25=max(0.24*420/sq(28)*25, 0.043*420*25), lap_16=max(0.071*420*16, 300), avail=600-75-2*20-16)

# ---------------- RW
g, phi_, H = 18.0, math.radians(30), 5.0
Ka = math.tan(math.radians(45)-phi_/2)**2; Pa = 0.5*g*H*H*Ka; Mo_ = Pa*H/3
Wst, Wb, Ws = 0.4*4.5*24, 3.0*0.5*24, 1.8*4.5*18
V = Wst+Wb+Ws; Mr = Wst*1.0+Wb*1.5+Ws*2.1
xb = (Mr-Mo_)/V; e = 1.5-xb
Mus = 1.6*Ka*g*4.5**3/6
P("RW-1", Ka=Ka, Pa=Pa, Mo=Mo_, V=V, Mr=Mr, FS_ot=Mr/Mo_, FS_sl=0.55*V/Pa, xbar=xb, e=e, kern=0.5, qmax=V/3*(1+6*e/3), qmin=V/3*(1-6*e/3), Mu_stem=Mus, Vu_stem_base=1.6*Ka*g*4.5**2/2, As_stem=As_req(Mus*1e6, 1000, 330, 28, 420), As_min_stem=0.0018*1000*400)
beta_, delta_ = math.radians(10), math.radians(20)
KaR = math.cos(beta_)*(math.cos(beta_)-sq(math.cos(beta_)**2-math.cos(phi_)**2))/(math.cos(beta_)+sq(math.cos(beta_)**2-math.cos(phi_)**2))
KaC = math.cos(phi_)**2/(math.cos(delta_)*(1+sq(math.sin(phi_+delta_)*math.sin(phi_-beta_)/(math.cos(delta_)*math.cos(beta_))))**2)
P("RW-2 coefficients phi30", Rankine_beta10=KaR, Coulomb_delta20_beta10=KaC, Kp=math.tan(math.radians(60))**2)

# ---------------- SW
fc = 28.0; hw_, lw = 250.0, 4000.0; d = 0.8*lw
Vc = 0.17*sq(fc)*hw_*d; Vs = 900e3/0.75-Vc; Av = 2*pi*12**2/4
P("SW-1", d=d, Vc_kN=Vc/1e3, phiVc=0.75*Vc/1e3, Vn_max_kN=0.83*sq(fc)*hw_*d/1e3, Vs_req_kN=Vs/1e3, Av=Av, s_strength=Av*420*d/Vs, s_rho_min=Av/(0.0025*hw_), s_max=min(lw/5, 3*hw_, 450), rho_t_at_350=Av/(hw_*350), rho_l_min=max(0.0025, 0.0025+0.5*(2.5-3000/4000)*(Av/(hw_*350)-0.0025)), phiVn_at_350=0.75*(Vc+Av*420*d/350)/1e3)
P("SW-2 simplified axial per m", Pn_kN=0.55*28*200*1000*(1-(0.8*3000/(32*200))**2)/1e3, phiPn=0.65*0.55*28*200*1000*(1-(0.8*3000/(32*200))**2)/1e3, h_min=max(100, 3000/25))

# ---------------- BP
A1 = 400.0*400; A2 = 600.0*600
Pp = min(0.85*21*A1*sq(A2/A1), 1.7*21*A1); m = (400-0.95*254)/2; n_ = (400-0.8*254)/2
X = 4*254*254/(254+254)**2*1500e3/(0.65*Pp); lam = min(1, 2*sq(X)/(1+sq(1-X))); ln_ = lam*sq(254*254)/4
l = max(m, n_, ln_)
P("BP-1", Pp_kN=Pp/1e3, phiPp=0.65*Pp/1e3, ASD=Pp/2.31/1e3, m=m, n=n_, X=X, lam=lam, lam_n=ln_, l=l, t_LRFD=l*sq(2*1500e3/(0.9*248*400*400)), t_ASD_Pa1000=l*sq(2*1000e3*1.67/(248*400*400)))
Abr = pi*24**2/4
P("BP-2 anchor rod M24 Fu400", Ab=Abr, Rnt_kN=0.75*400*Abr/1e3, phi_t=0.75*0.75*400*Abr/1e3, Rnv_kN=0.45*400*Abr/1e3, phi_v=0.75*0.45*400*Abr/1e3)

# ---------------- MAT
xs = [-4.5, 0.0, 4.5]; ys = [7.5, 2.5, -2.5, -7.5]
Q = [[400, 500, 450], [1500, 1500, 1200], [1500, 1500, 1200], [400, 500, 350]]
B, Lm = 10.0, 16.0
tot = sum(map(sum, Q)); Mx_ = sum(Q[i][j]*ys[i] for i in range(4) for j in range(3)); My_ = sum(Q[i][j]*xs[j] for i in range(4) for j in range(3))
ex, ey = My_/tot, Mx_/tot; Iy_ = Lm*B**3/12; Ix_ = B*Lm**3/12
q = lambda x, y: tot/(B*Lm) + My_*x/Iy_ + Mx_*y/Ix_
P("MAT-1", Q=tot, ex=ex, ey=ey, Ix=Ix_, Iy=Iy_, q_avg=tot/(B*Lm), qA_m5_p8=q(-5, 8), qB_p5_p8=q(5, 8), qC_p5_m8=q(5, -8), qD_m5_m8=q(-5, -8))
B1 = 2.75  # left strip x from -5 to -2.25
qav = (q(-3.625, 8)+q(-3.625, -8))/2; soil = qav*B1*Lm; col = sum(Q[i][0] for i in range(4)); avg = (soil+col)/2
P("MAT-1 strip x=-4.5", width=B1, q_av=qav, soil_reaction=soil, column_sum=col, average=avg, q_mod=qav*avg/soil, F=avg/col)

# ---------------- PL
D = 0.4; Ap = pi*D*D/4; p = pi*D
qp_ = 17*15*143; ql = 0.5*100*143*math.tan(math.radians(35)); Qp = Ap*min(qp_, ql)
f = 1.3*17*6*math.tan(math.radians(28)); Qs = p*(0.5*f*6+f*9)
P("PL-1 sand", Ap=Ap, p=p, q_Nq=qp_, ql=ql, Qp=Qp, Lcrit=15*D, f_max=f, Qs=Qs, Qu=Qp+Qs, Qall=(Qp+Qs)/3)
Qp2 = 9*60*Ap; Qs2 = 0.62*60*p*20
P("PL-2 clay", Qp=Qp2, Qs=Qs2, Qu=Qp2+Qs2, Qall=(Qp2+Qs2)/3)
th = math.degrees(math.atan(0.4/1.2)); eta = 1-th*((3-1)*4+(4-1)*3)/(90*3*4)
blk = 4.0*2.8*60*9+2*(4.0+2.8)*60*20
P("PL-3 group", theta=th, eta=eta, eta_x_sumQu_sand=eta*12*(Qp+Qs), block=blk, sumQu=12*(Qp2+Qs2), Qg_clay=min(blk, 12*(Qp2+Qs2)))

# ---------------- PC
Rhi, Rlo = 3200/4+240*0.6/(4*0.36), 3200/4-240*0.6/(4*0.36)
d = 550.0
f1 = max(0, min(1, (600-(250+d)+200)/400)); f2 = max(0, min(1, (600-(250+d/2)+200)/400))
bo = 4*(500+d)
P("PC-1", R_hi=Rhi, R_lo=Rlo, oneway_fraction=f1, Vu_oneway=f1*2*Rhi, phiVc_oneway=0.75*0.17*sq(28)*2000*d/1e3, twoway_fraction=f2, Vu_twoway=f2*3200, bo=bo, phiVc_twoway=0.75*0.33*sq(28)*bo*d/1e3, Mu=2*Rhi*(0.6-0.25), As=As_req(2*Rhi*0.35*1e6, 2000, d, 28, 420), As_min=0.0018*2000*700, pile_punch_bo=pi*(400+d), phiVc_pile=0.75*0.33*sq(28)*pi*(400+d)*d/1e3)
d = 450.0
f1 = max(0, min(1, (600-(250+d)+200)/400)); f2 = max(0, min(1, (600-(250+d/2)+200)/400))
P("PC-2 d450", oneway_fraction=f1, Vu_oneway=f1*2*Rhi, phiVc_oneway=0.75*0.17*sq(28)*2000*d/1e3, twoway_fraction=f2, Vu_twoway=f2*3200, phiVc_twoway=0.75*0.33*sq(28)*4*(500+d)*d/1e3)
